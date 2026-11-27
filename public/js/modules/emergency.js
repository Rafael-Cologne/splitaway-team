// ============================================================
// Модуль «Экстренно» (id: 'emergency')
// Ответственный: Rafael
// ------------------------------------------------------------
// По макету Рафаэля: главный экран (SOS + 6 разделов + «Моя информация»),
// «Экстренные номера», «Моя информация» (Данные / Документы / Контакты, QR-карта).
// Главное работает без интернета и в одно нажатие:
//   • номера страны поездки лежат в самом приложении (таблица N ниже), звонок — tel:;
//   • координаты — по GPS (без интернета), адрес и «Помощь рядом» — когда есть сеть (OpenStreetMap);
//   • посольство — Wikidata; медкарта, документы и контакты — ТОЛЬКО на этом устройстве
//     (localStorage + IndexedDB), никуда не отправляются.
// Номера сверены по списку Википедии «List of emergency telephone numbers» (ноябрь 2026).
// Картинки: /img/emergency/*.webp (сгенерированы в Figma).
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const ID = 'emergency';
  const IMG = '/img/emergency/';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = el => { if (typeof initializeIcons === 'function') initializeIcons(el); };
  const regionName = cc => { try { return new Intl.DisplayNames(['ru'], { type: 'region' }).of(cc.toUpperCase()); } catch (_) { return cc.toUpperCase(); } };
  const flagEmoji = cc => cc && cc.length === 2 ? String.fromCodePoint(...cc.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0))) : '';
  const tel = v => 'tel:' + String(v).replace(/[^\d+]/g, '');

  // ---------- Номера: g — единый; a — скорая; p — полиция; f — пожарные; x — [описание, номер] ----------
  const N = {
    DE: { g: '112', p: '110', x: [['Дежурная медицинская помощь (не угроза жизни)', '116117']] }, AT: { g: '112', a: '144', p: '133', f: '122', x: [['Медицинская консультация (не угроза жизни)', '1450']] },
    CH: { g: '112', a: '144', p: '117', f: '118' }, FR: { g: '112', a: '15', p: '17', f: '18' }, ES: { g: '112', p: '091' }, IT: { g: '112', a: '118', p: '113', f: '115' },
    PT: { g: '112' }, NL: { g: '112' }, BE: { g: '112', p: '101' }, LU: { g: '112', p: '113' }, IE: { g: '112', x: [['Также работает', '999']] },
    GB: { g: '999', x: [['Также работает', '112'], ['Медицинская помощь (не угроза жизни)', '111'], ['Полиция (не срочно)', '101']] },
    PL: { g: '112', a: '999', p: '997', f: '998' }, CZ: { g: '112', a: '155', p: '158', f: '150' }, SK: { g: '112', a: '155', p: '158', f: '150' },
    HU: { g: '112', a: '104', p: '107', f: '105' }, SI: { g: '112', p: '113' }, HR: { g: '112', a: '194', p: '192', f: '193' },
    GR: { g: '112', a: '166', p: '100', f: '199', x: [['Туристическая полиция', '1571']] }, CY: { g: '112', x: [['Также работает', '199']] }, MT: { g: '112' },
    BG: { g: '112' }, RO: { g: '112' }, DK: { g: '112' }, SE: { g: '112' }, FI: { g: '112' }, IS: { g: '112' },
    NO: { g: '112', a: '113', p: '112', f: '110' }, EE: { g: '112' }, LV: { g: '112' }, LT: { g: '112' },
    ME: { g: '112', a: '124', p: '122', f: '123' }, MK: { g: '112', a: '194', p: '192', f: '193' }, AL: { g: '112', a: '127', p: '129', f: '128' },
    RS: { a: '194', p: '192', f: '193' }, BA: { a: '124', p: '122', f: '123' }, MD: { g: '112' },
    TR: { g: '112' }, GE: { g: '112' }, AM: { g: '112', x: [['Также работает', '911']] }, AZ: { g: '112', a: '103', p: '102', f: '101' },
    UA: { g: '112', a: '103', p: '102', f: '101' }, RU: { g: '112', a: '103', p: '102', f: '101' }, BY: { g: '112', a: '103', p: '102', f: '101' },
    KZ: { g: '112', a: '103', p: '102', f: '101' }, UZ: { a: '103', p: '102', f: '101' }, KG: { g: '112', a: '103', p: '102', f: '101' },
    US: { g: '911' }, CA: { g: '911' }, MX: { g: '911' }, DO: { g: '911' }, CU: { a: '104', p: '106', f: '105' },
    BR: { a: '192', p: '190', f: '193' }, AR: { g: '911', a: '107', f: '100' },
    AU: { g: '000', x: [['С мобильного также', '112']] }, NZ: { g: '111' },
    JP: { a: '119', p: '110', f: '119' }, KR: { a: '119', p: '112', f: '119' }, CN: { a: '120', p: '110', f: '119' },
    HK: { g: '999' }, SG: { a: '995', p: '999', f: '995' }, MY: { g: '999' }, PH: { g: '911' },
    TH: { a: '1669', p: '191', f: '199', x: [['Туристическая полиция', '1155']] }, VN: { a: '115', p: '113', f: '114' },
    ID: { g: '112', a: '118', p: '110', f: '113' }, IN: { g: '112', a: '108', p: '100', f: '101' }, LK: { a: '1990', p: '119', f: '110' },
    MV: { a: '102', p: '119', f: '118' }, AE: { a: '998', p: '999', f: '997' }, SA: { g: '911' }, QA: { g: '999' },
    IL: { a: '101', p: '100', f: '102' }, EG: { a: '123', p: '122', f: '180', x: [['Туристическая полиция', '126']] },
    MA: { a: '15', p: '19', f: '15' }, TN: { a: '190', p: '197', f: '198' }, ZA: { a: '10177', p: '10111', x: [['С мобильного', '112']] }
  };
  const LANG = { DE: 'de', AT: 'de', CH: 'de', LU: 'fr', BE: 'fr', FR: 'fr', MA: 'fr', TN: 'fr', ES: 'es', MX: 'es', AR: 'es', CU: 'es', DO: 'es', IT: 'it',
    PT: 'pt', BR: 'pt', NL: 'nl', PL: 'pl', CZ: 'cs', SK: 'cs', TR: 'tr', GR: 'el', CY: 'el', HR: 'hr', RS: 'hr', BA: 'hr', ME: 'hr', SI: 'hr',
    JP: 'ja', CN: 'zh', HK: 'zh', AE: 'ar', SA: 'ar', QA: 'ar', EG: 'ar', RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru', UA: 'ru' };
  const LANG_NAME = { en: 'английском', de: 'немецком', fr: 'французском', es: 'испанском', it: 'итальянском', pt: 'португальском', nl: 'нидерландском', pl: 'польском',
    cs: 'чешском', tr: 'турецком', el: 'греческом', hr: 'хорватском/сербском', ja: 'японском', zh: 'китайском', ar: 'арабском', ru: 'русском' };
  const VOICE = { en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', nl: 'nl-NL', pl: 'pl-PL', cs: 'cs-CZ', tr: 'tr-TR', el: 'el-GR', hr: 'hr-HR', ja: 'ja-JP', zh: 'zh-CN', ar: 'ar-SA', ru: 'ru-RU' };
  const PHRASES = [
    { ru: 'Помогите!', en: 'Help!', de: 'Hilfe!', fr: 'Au secours !', es: '¡Ayuda!', it: 'Aiuto!', pt: 'Socorro!', nl: 'Help!', pl: 'Pomocy!', cs: 'Pomoc!', tr: 'İmdat!', el: 'Βοήθεια!', hr: 'Upomoć!', ja: '助けて！', zh: '救命！', ar: '!النجدة' },
    { ru: 'Вызовите скорую помощь!', en: 'Call an ambulance!', de: 'Rufen Sie einen Krankenwagen!', fr: 'Appelez une ambulance !', es: '¡Llame a una ambulancia!', it: 'Chiamate un’ambulanza!', pt: 'Chame uma ambulância!', nl: 'Bel een ambulance!', pl: 'Proszę wezwać karetkę!', cs: 'Zavolejte záchranku!', tr: 'Ambulans çağırın!', el: 'Καλέστε ασθενοφόρο!', hr: 'Pozovite hitnu pomoć!', ja: '救急車を呼んでください！', zh: '请叫救护车！', ar: '!اتصلوا بالإسعاف' },
    { ru: 'Вызовите полицию!', en: 'Call the police!', de: 'Rufen Sie die Polizei!', fr: 'Appelez la police !', es: '¡Llame a la policía!', it: 'Chiamate la polizia!', pt: 'Chame a polícia!', nl: 'Bel de politie!', pl: 'Proszę wezwać policję!', cs: 'Zavolejte policii!', tr: 'Polis çağırın!', el: 'Καλέστε την αστυνομία!', hr: 'Pozovite policiju!', ja: '警察を呼んでください！', zh: '请报警！', ar: '!اتصلوا بالشرطة' },
    { ru: 'Мне нужен врач.', en: 'I need a doctor.', de: 'Ich brauche einen Arzt.', fr: 'J’ai besoin d’un médecin.', es: 'Necesito un médico.', it: 'Ho bisogno di un medico.', pt: 'Preciso de um médico.', nl: 'Ik heb een dokter nodig.', pl: 'Potrzebuję lekarza.', cs: 'Potřebuji lékaře.', tr: 'Doktora ihtiyacım var.', el: 'Χρειάζομαι γιατρό.', hr: 'Trebam liječnika.', ja: '医者が必要です。', zh: '我需要看医生。', ar: '.أحتاج إلى طبيب' },
    { ru: 'Меня обокрали.', en: 'I have been robbed.', de: 'Ich wurde bestohlen.', fr: 'On m’a volé.', es: 'Me han robado.', it: 'Sono stato derubato.', pt: 'Fui roubado.', nl: 'Ik ben bestolen.', pl: 'Zostałem okradziony.', cs: 'Byl jsem okraden.', tr: 'Soyuldum.', el: 'Με έκλεψαν.', hr: 'Opljačkan sam.', ja: '盗難に遭いました。', zh: '我被偷了。', ar: '.لقد سُرقت' },
    { ru: 'Я потерял паспорт.', en: 'I have lost my passport.', de: 'Ich habe meinen Reisepass verloren.', fr: 'J’ai perdu mon passeport.', es: 'He perdido mi pasaporte.', it: 'Ho perso il passaporto.', pt: 'Perdi o meu passaporte.', nl: 'Ik ben mijn paspoort kwijt.', pl: 'Zgubiłem paszport.', cs: 'Ztratil jsem pas.', tr: 'Pasaportumu kaybettim.', el: 'Έχασα το διαβατήριό μου.', hr: 'Izgubio sam putovnicu.', ja: 'パスポートをなくしました。', zh: '我的护照丢了。', ar: '.فقدت جواز سفري' },
    { ru: 'Где ближайшая больница?', en: 'Where is the nearest hospital?', de: 'Wo ist das nächste Krankenhaus?', fr: 'Où est l’hôpital le plus proche ?', es: '¿Dónde está el hospital más cercano?', it: 'Dov’è l’ospedale più vicino?', pt: 'Onde fica o hospital mais próximo?', nl: 'Waar is het dichtstbijzijnde ziekenhuis?', pl: 'Gdzie jest najbliższy szpital?', cs: 'Kde je nejbližší nemocnice?', tr: 'En yakın hastane nerede?', el: 'Πού είναι το πλησιέστερο νοσοκομείο;', hr: 'Gdje je najbliža bolnica?', ja: '一番近い病院はどこですか？', zh: '最近的医院在哪里？', ar: 'أين أقرب مستشفى؟' },
    { ru: 'Я не говорю на вашем языке. Вы говорите по-английски?', en: 'I don’t speak your language. Do you speak English?', de: 'Ich spreche kein Deutsch. Sprechen Sie Englisch?', fr: 'Je ne parle pas français. Parlez-vous anglais ?', es: 'No hablo español. ¿Habla inglés?', it: 'Non parlo italiano. Parla inglese?', pt: 'Não falo português. Fala inglês?', nl: 'Ik spreek geen Nederlands. Spreekt u Engels?', pl: 'Nie mówię po polsku. Czy mówi pan/pani po angielsku?', cs: 'Nemluvím česky. Mluvíte anglicky?', tr: 'Türkçe bilmiyorum. İngilizce biliyor musunuz?', el: 'Δεν μιλάω ελληνικά. Μιλάτε αγγλικά;', hr: 'Ne govorim vaš jezik. Govorite li engleski?', ja: '日本語が話せません。英語を話せますか？', zh: '我不会说中文。您会说英语吗？', ar: 'لا أتكلم العربية. هل تتكلم الإنجليزية؟' }
  ];
  const ALLERGY = { ru: 'У меня аллергия на: ', en: 'I am allergic to: ', de: 'Ich bin allergisch gegen: ', fr: 'Je suis allergique à : ', es: 'Soy alérgico/a a: ', it: 'Sono allergico/a a: ', pt: 'Sou alérgico/a a: ', nl: 'Ik ben allergisch voor: ', pl: 'Jestem uczulony/a na: ', cs: 'Jsem alergický/á na: ', tr: 'Şuna alerjim var: ', el: 'Είμαι αλλεργικός/ή σε: ', hr: 'Alergičan/na sam na: ', ja: '次のアレルギーがあります：', zh: '我对以下过敏：', ar: 'لدي حساسية من: ' };
  const COUNTRIES = 'AF AL DZ AD AO AR AM AU AT AZ BH BD BY BE BJ BO BA BR BG KH CM CA CL CN CO CR HR CU CY CZ DK DO EC EG EE ET FI FR GE DE GH GR GT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KR KW KG LV LB LY LT LU MK MY MV MT MX MD MC MN ME MA MZ MM NP NL NZ NG NO OM PK PA PY PE PH PL PT QA RO RU SA SN RS SG SK SI ZA ES LK SE CH SY TW TJ TZ TH TN TR TM UA AE GB US UY UZ VE VN YE'.split(' ');

  STHub.addStyles(ID, `
    #pg-module[data-module="em-home"] .hub-title-row{display:none}
    #pg-module[data-module="em-home"] .mod-wrap{padding-top:0}
    .em-hero{position:relative;margin:0 -16px;height:calc(330px + var(--st,0px));background:#1b2350 url(${IMG}hero.webp) center top/cover no-repeat;overflow:hidden}
    .em-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,18,60,.15) 0%,rgba(30,30,90,.18) 45%,rgba(238,237,251,0) 70%,var(--bg) 100%)}
    .em-hero-btn{position:absolute;top:calc(14px + var(--st,0px));z-index:2;width:44px;height:44px;border:0;background:none;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .em-hero-btn svg{width:28px;height:28px;stroke-width:2}
    .em-hero-t{position:absolute;left:0;right:0;top:46%;z-index:2;text-align:center;color:#fff}
    .em-hero-t h1{margin:0;font-size:2.15rem;font-weight:800;letter-spacing:-.01em;text-shadow:0 2px 14px rgba(0,0,20,.45)}
    .em-hero-t p{margin:6px 0 0;font-size:1rem;opacity:.95;text-shadow:0 1px 8px rgba(0,0,20,.45)}
    .em-sos{position:relative;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;margin:-62px 2px 4px;min-height:104px;border-radius:999px;text-decoration:none;color:#fff;
      background:radial-gradient(120% 140% at 50% 0%,#ff5a55 0%,#e5262c 55%,#c81622 100%);box-shadow:0 14px 30px rgba(220,30,40,.38),inset 0 2px 0 rgba(255,255,255,.35),inset 0 -6px 14px rgba(120,0,10,.25);border:3px solid rgba(255,255,255,.55)}
    .em-sos .l1{display:flex;align-items:center;gap:14px;font-size:2.1rem;font-weight:800;letter-spacing:.02em}
    .em-sos .l1 svg{width:38px;height:38px;fill:#fff;stroke:#fff}
    .em-sos .l2{font-size:1.05rem;font-weight:600;opacity:.95}
    .em-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .em-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:110px;padding:12px 8px;border-radius:22px;border:1px solid var(--hub-card-b);background:var(--hub-card);box-shadow:var(--hub-shadow);font:inherit;color:var(--text);cursor:pointer;text-align:center}
    .em-tile img{width:46px;height:46px;object-fit:contain}
    .em-tile b{font-size:.95rem;font-weight:700;line-height:1.2}
    .em-me{display:flex;align-items:center;gap:14px;width:100%;padding:14px 16px;border-radius:22px;border:1px solid var(--hub-card-b);background:var(--hub-card);box-shadow:var(--hub-shadow);font:inherit;color:var(--text);cursor:pointer;text-align:left}
    .em-me img{width:44px;height:44px;object-fit:contain;flex-shrink:0}
    .em-me span{flex:1;min-width:0}
    .em-me b{display:block;font-size:1rem;font-weight:800}
    .em-me small{display:block;font-size:.8rem;color:var(--t2);margin-top:2px}
    .em-me>svg{width:22px;height:22px;flex-shrink:0}
    .em-country{display:flex;align-items:center;justify-content:center;gap:10px;margin:-4px 0 4px;border:0;background:none;font:inherit;color:var(--text);font-size:1.25rem;font-weight:700;cursor:pointer}
    .em-country i.f{font-style:normal;font-size:1.6rem;line-height:1}
    .em-country img{width:34px;height:23px;border-radius:4px;object-fit:cover;box-shadow:0 1px 3px rgba(0,0,0,.2)}
    .em-list{display:flex;flex-direction:column;gap:10px}
    .em-num{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:20px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow);color:var(--text);text-decoration:none}
    .em-ic{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .em-ic svg{width:24px;height:24px;stroke-width:2.2}
    .em-num>span:not(.em-ic):not(.em-call){flex:1;min-width:0}
    .em-num b{display:block;font-size:1.5rem;font-weight:800;letter-spacing:.01em;line-height:1.1}
    .em-num small{display:block;font-size:.84rem;color:var(--t2);line-height:1.3;margin-top:2px}
    .em-call{width:40px;height:40px;border-radius:50%;background:rgba(106,77,244,.1);color:#5b4bd6;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .em-call svg{width:19px;height:19px;fill:currentColor;stroke:currentColor}
    .em-info{display:flex;align-items:center;gap:14px;padding:16px;border-radius:20px;background:rgba(106,77,244,.08);color:var(--text);font-size:.92rem;line-height:1.4}
    .em-info svg{width:28px;height:28px;color:#5b4bd6;flex-shrink:0}
    .em-tabs{display:grid;grid-template-columns:repeat(3,1fr);padding:4px;border-radius:999px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .em-tabs button{border:0;background:none;font:inherit;font-weight:700;font-size:.95rem;color:var(--text);padding:11px 4px;border-radius:999px;cursor:pointer}
    .em-tabs button.on{background:linear-gradient(135deg,#5b4bd6,#7b6bf0);color:#fff;box-shadow:0 6px 14px rgba(91,75,214,.3)}
    .em-rows{border-radius:20px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow);overflow:hidden}
    .em-row{display:flex;align-items:center;gap:14px;width:100%;padding:13px 16px;border:0;border-bottom:1px solid var(--hub-card-b);background:none;font:inherit;color:var(--text);text-align:left;text-decoration:none}
    .em-row:last-child{border-bottom:0}
    button.em-row{cursor:pointer}
    .em-row>svg:first-child{width:28px;height:28px;flex-shrink:0;stroke-width:1.8}
    .em-row span{flex:1;min-width:0}
    .em-row b{display:block;font-weight:800;font-size:.98rem}
    .em-row small{display:block;font-size:.92rem;color:var(--t2);margin-top:1px;overflow-wrap:anywhere}
    .em-row>svg:last-child:not(:first-child){width:20px;height:20px;flex-shrink:0}
    .em-qr{display:flex;align-items:center;justify-content:center;gap:16px;width:100%;padding:16px;border-radius:999px;border:1.5px solid rgba(106,77,244,.25);background:var(--hub-card);box-shadow:0 8px 22px rgba(106,77,244,.12);font:inherit;color:var(--text);cursor:pointer}
    .em-qr svg{width:36px;height:36px;color:#5b4bd6}
    .em-qr span{text-align:left}
    .em-qr b{display:block;font-size:1.05rem;font-weight:800}
    .em-qr small{display:block;color:var(--t2);font-size:.86rem}
    .em-card{padding:14px 16px;border-radius:20px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .em-card h3{margin:0 0 6px;font-size:1rem;font-weight:800}
    .em-loc b{display:block;font-size:1.3rem;font-weight:800;font-variant-numeric:tabular-nums}
    .em-loc small{display:block;color:var(--t2);font-size:.84rem;margin-top:4px;line-height:1.4}
    .em-btns{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
    .em-btns .st-btn{flex:1;min-width:130px;text-decoration:none}
    .em-pl{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--hub-card-b)}
    .em-pl:last-child{border-bottom:0}
    .em-pl>svg{width:22px;height:22px;flex-shrink:0}
    .em-pl span{flex:1;min-width:0}
    .em-pl span small{display:block;color:var(--t2);font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .em-pl a{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(106,77,244,.1);color:#5b4bd6;flex-shrink:0}
    .em-pl a svg{width:18px;height:18px}
    .em-maps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
    .em-maps a{display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 4px;border-radius:14px;border:1px solid var(--hub-card-b);color:var(--text);text-decoration:none;font-size:.78rem;font-weight:600}
    .em-maps svg{width:20px;height:20px;color:#e5262c}
    .em-steps{counter-reset:s;display:flex;flex-direction:column;gap:10px}
    .em-step{position:relative;padding:14px 16px 14px 56px;border-radius:20px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .em-step::before{counter-increment:s;content:counter(s);position:absolute;left:16px;top:14px;width:28px;height:28px;border-radius:50%;background:rgba(229,38,44,.12);color:#e5262c;font-weight:800;display:flex;align-items:center;justify-content:center}
    .em-step b{display:block;font-weight:800}
    .em-step small{display:block;color:var(--t2);font-size:.86rem;line-height:1.4;margin-top:2px}
    .em-step .em-btns{margin-top:10px}
    .em-ph{display:block;width:100%;text-align:left;font:inherit;color:var(--text);cursor:pointer;padding:12px 14px;border-radius:16px;background:var(--hub-card);border:1px solid var(--hub-card-b)}
    .em-ph b{display:block;font-size:1.02rem;font-weight:700}
    .em-ph small{display:block;color:var(--t2);font-size:.78rem;margin-top:2px}
    .em-sec{font-size:.98rem;font-weight:800;margin:10px 2px 0}
    .em-note{font-size:.78rem;color:var(--t2);margin:2px 2px 0;line-height:1.45}
    .em-doc{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--hub-card-b)}
    .em-doc:last-child{border-bottom:0}
    .em-doc .th{width:52px;height:52px;border-radius:12px;background:var(--bg2,#eee) center/cover;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#5b4bd6;cursor:pointer;border:0}
    .em-doc span{flex:1;min-width:0}
    .em-doc small{display:block;color:var(--t2);font-size:.78rem}
    .em-doc button.x{width:36px;height:36px;border:0;border-radius:10px;background:rgba(229,38,44,.08);color:#e5262c;cursor:pointer;display:flex;align-items:center;justify-content:center}
    .em-full{position:fixed;inset:0;z-index:400;background:#fff;color:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;text-align:center;overflow:auto}
    .em-full .t{font-size:clamp(2rem,9vw,3.4rem);font-weight:800;line-height:1.2}
    .em-full .s{margin-top:18px;font-size:1rem;color:#555}
    .em-full .c{position:absolute;top:calc(14px + var(--st,0px));right:14px;display:flex;gap:8px}
    .em-full .c button{width:48px;height:48px;border-radius:50%;border:1px solid #ddd;background:#f4f4f6;color:#111;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .em-full img.doc{max-width:100%;max-height:80vh;border-radius:12px}
    .em-form{display:grid;gap:10px;max-height:min(60vh,540px);overflow-y:auto;padding:2px}
    .em-form label{display:block;font-size:.78rem;color:var(--t2);margin:0 2px 4px}
    [data-theme=dark] .em-full,[data-theme=midnight] .em-full{background:#fff;color:#111}
  `);

  // ---------- общие помощники ----------
  function sheet(title, html, bind) {
    document.getElementById('em-sheet')?.remove();
    const ov = document.createElement('div'); ov.className = 'ov open'; ov.id = 'em-sheet';
    ov.innerHTML = `<div class="mdl"><div class="mdl-handle"></div><div class="mdl-title">${esc(title)}</div>${html}</div>`;
    let done = false;
    const close = () => { if (done) return; done = true; ov.remove(); document.body.style.overflow = ''; };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    (document.getElementById('pg-module') || document.body).appendChild(ov);
    document.body.style.overflow = 'hidden'; icons(ov);
    bind(ov.firstChild, close);
  }
  function fullScreen(html, speak) {
    const el = document.createElement('div'); el.className = 'em-full';
    el.innerHTML = `<div class="c">${speak ? '<button type="button" data-a="say" aria-label="Озвучить"><i data-lucide="volume-2"></i></button>' : ''}<button type="button" data-a="x" aria-label="Закрыть"><i data-lucide="x"></i></button></div>${html}`;
    document.body.appendChild(el); icons(el);
    el.querySelector('[data-a="x"]').addEventListener('click', () => { try { speechSynthesis.cancel(); } catch (_) {} el.remove(); });
    el.querySelector('[data-a="say"]')?.addEventListener('click', speak);
    return el;
  }
  function say(text, lang) { try { const u = new SpeechSynthesisUtterance(text); u.lang = VOICE[lang] || 'en-GB'; u.rate = .9; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (_) {} }
  async function getJSON(url, ms, opts) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 10000);
    try { const r = await fetch(url, Object.assign({ signal: ctl.signal }, opts || {})); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  const dist = (a, b, c, d) => { const r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r; const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
  const kmTxt = k => k < 1 ? Math.round(k * 1000 / 10) * 10 + ' м' : k.toFixed(1).replace('.', ',') + ' км';
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const translit = t => String(t).replace(/[а-яё]/gi, ch => { const l = TR[ch.toLowerCase()] ?? ch; return ch === ch.toLowerCase() ? l : l.charAt(0).toUpperCase() + l.slice(1); });
  const flagImg = cc => cc ? `<img src="https://flagcdn.com/w40/${cc.toLowerCase()}.png" alt="" style="width:20px;height:14px;border-radius:2px;vertical-align:-2px;margin-right:4px;object-fit:cover">` : '';
  const dateRu = s => { try { return new Date(s + 'T12:00:00').toLocaleDateString(window.STModuleUI?.locale() || 'ru-RU'); } catch (_) { return s; } };

  // ---------- личные данные: только на устройстве ----------
  const ME_KEY = 'st_emergency_me';
  const meGet = () => { try { const o = JSON.parse(localStorage.getItem(ME_KEY) || 'null'); if (o) return o; const old = JSON.parse(localStorage.getItem('st_emergency_card') || 'null'); return old || {}; } catch (_) { return {}; } };
  const meSet = o => { try { localStorage.setItem(ME_KEY, JSON.stringify(o)); } catch (_) {} };
  // документы (фото/PDF) — IndexedDB
  let dbP = null;
  const db = () => dbP || (dbP = new Promise((ok, no) => { const r = indexedDB.open('st_emergency_docs', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }));
  const idb = async (mode, fn) => { const d = await db(); return new Promise((ok, no) => { const tx = d.transaction('f', mode), st = tx.objectStore('f'); const q = fn(st); tx.oncomplete = () => ok(q && q.result); tx.onerror = () => no(tx.error); }); };
  const DOC_KINDS = [['passport', 'Паспорт'], ['insurance', 'Страховка'], ['visa', 'Виза'], ['id', 'Удостоверение / права'], ['other', 'Другое']];

  STHub.registerService(ID, ctx => {
    const trip = ctx.trip || {};
    // Страна: выбранная вручную → страна места поездки (по «Направлению»/названию) → страна по GPS.
    // Страна поездки запоминается вместе с местом: сменили «Направление» — страна определяется заново.
    const placeKey = [trip.dest || '', trip.name || ''].join('|').toLowerCase();
    const savedTrip = ctx.store.get('ccTrip', null);
    const S = { cc: ctx.store.get('cc', null), ccTrip: savedTrip && savedTrip.q === placeKey ? savedTrip.cc : null, ccGps: null, loc: null, locErr: '', near: null, emb: null, tab: 'data' };
    const ccNow = () => (S.cc || S.ccTrip || S.ccGps || '').toUpperCase();
    const ccSource = () => S.cc ? 'выбрано вручную' : S.ccTrip ? 'по месту поездки' : S.ccGps ? 'по GPS' : '';
    const nums = () => N[ccNow()] || null;
    const mainNum = () => { const n = nums(); return n ? (n.g || n.a || n.p) : '112'; };
    const lang = () => LANG[ccNow()] || 'en';
    const citizenships = () => (meGet().citizen || []).filter(Boolean);

    // один общий поиск страны поездки; каждый открытый экран перерисуется, когда страна найдётся
    let detectP = null;
    function detectCountry(after) {
      if (S.ccTrip) return;
      if (!detectP) detectP = (async () => {
        for (const q of [trip.dest, trip.name].filter(Boolean)) {
          try {
            const j = await getJSON(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&accept-language=ru&q=${encodeURIComponent(q)}`, 9000);
            const cc = j[0] && j[0].address && j[0].address.country_code;
            if (cc) { S.ccTrip = cc.toUpperCase(); ctx.store.set('ccTrip', { q: placeKey, cc: S.ccTrip }); S.emb = null; return true; }
          } catch (_) {}
        }
        detectP = null; return false; // не нашли / нет сети — попробуем при следующем открытии
      })();
      detectP.then(ok => { if (ok && after) after(); });
    }
    function locate(screen) {
      if (!navigator.geolocation) { S.locErr = 'Геолокация недоступна на этом устройстве'; screen.refresh(); return; }
      S.locErr = ''; S.loc = { busy: true }; screen.refresh();
      navigator.geolocation.getCurrentPosition(async p => {
        S.loc = { lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }; screen.refresh();
        try {
          const j = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=ru&zoom=18&addressdetails=1&lat=${S.loc.lat}&lon=${S.loc.lon}`, 9000);
          const a = j.address || {};
          S.loc.addr = [a.road && (a.road + (a.house_number ? ' ' + a.house_number : '')), a.postcode && a.city ? a.postcode + ' ' + a.city : (a.city || a.town || a.village)].filter(Boolean).join(', ') || j.display_name;
          if (a.country_code) S.ccGps = a.country_code.toUpperCase();
        } catch (_) {}
        screen.refresh(); if (screen.near) nearby(screen);
      }, () => { S.loc = null; S.locErr = 'Не получилось определить место — разрешите доступ к геолокации в настройках телефона'; screen.refresh(); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    }
    async function nearby(screen) {
      if (!S.loc || S.loc.lat == null) return;
      S.near = { busy: true }; screen.refresh();
      const { lat, lon } = S.loc;
      const q = `[out:json][timeout:15];(nwr["amenity"="hospital"](around:5000,${lat},${lon});nwr["amenity"="pharmacy"](around:2000,${lat},${lon});nwr["amenity"="police"](around:4000,${lat},${lon}););out center 80;`;
      const opts = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: 'data=' + encodeURIComponent(q) };
      try {
        const j = await Promise.any(['https://overpass-api.de/api/interpreter', 'https://z.overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'].map(u => getJSON(u, 12000, opts)));
        const items = (j.elements || []).map(e => { const t = e.tags || {}, la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
          return la == null ? null : { kind: t.amenity, name: t['name:ru'] || t.name || '', phone: t.phone || t['contact:phone'] || '', em: t.emergency === 'yes', lat: la, lon: lo, km: dist(lat, lon, la, lo) }; }).filter(Boolean);
        const pick = (k, n) => items.filter(i => i.kind === k).sort((a, b) => (k === 'hospital' ? (b.em - a.em) : 0) || a.km - b.km).slice(0, n);
        S.near = { hospital: pick('hospital', 3), pharmacy: pick('pharmacy', 2), police: pick('police', 2) };
      } catch (_) { S.near = { err: true }; }
      screen.refresh();
    }
    async function embassies(screen) {
      const cc = ccNow(), list = citizenships().filter(h => h !== cc);
      if (!cc || !list.length) { S.emb = { list: [] }; return; }
      S.emb = { busy: true }; screen.refresh();
      const sparql = `SELECT ?e ?eLabel ?home ?coord ?phone ?site ?addr ?cityLabel WHERE {
        VALUES ?home { ${list.map(h => '"' + h + '"').join(' ')} } ?from wdt:P297 ?home. ?to wdt:P297 "${cc}".
        ?e wdt:P31/wdt:P279* wd:Q3917681; wdt:P137 ?from; wdt:P17 ?to.
        OPTIONAL{?e wdt:P625 ?coord} OPTIONAL{?e wdt:P1329 ?phone} OPTIONAL{?e wdt:P856 ?site} OPTIONAL{?e wdt:P6375 ?addr} OPTIONAL{?e wdt:P131 ?city}
        SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". } } LIMIT 20`;
      try {
        const j = await getJSON('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql), 15000, { headers: { Accept: 'application/sparql-results+json' } });
        const by = {};
        (j.results.bindings || []).forEach(b => { const id = b.e.value; const o = by[id] || (by[id] = { name: b.eLabel.value, home: b.home.value, phone: '', site: '', addr: '', city: '' });
          if (b.phone && !o.phone) o.phone = b.phone.value; if (b.site && !o.site) o.site = b.site.value; if (b.addr && !o.addr) o.addr = b.addr.value; if (b.cityLabel && !o.city) o.city = b.cityLabel.value;
          if (b.coord && !o.lat) { const m = b.coord.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/); if (m) { o.lon = +m[1]; o.lat = +m[2]; } } });
        S.emb = { list: Object.values(by).filter(o => !/^Q\d+$/.test(o.name)), homes: list };
      } catch (_) { S.emb = { err: true, homes: list }; }
      screen.refresh();
    }
    function countrySheet(onDone, multi) {
      const sel = new Set(multi ? citizenships() : []);
      const codes = multi ? COUNTRIES : Object.keys(N);
      const list = codes.map(c => [c, regionName(c)]).sort((a, b) => a[1].localeCompare(b[1], 'ru'));
      sheet(multi ? 'Гражданство' : 'Страна, где я сейчас', `<input class="st-input" id="em-cq" placeholder="Найти страну" style="margin:6px 0 8px">
        <div style="max-height:min(52vh,440px);overflow-y:auto;display:flex;flex-direction:column;gap:6px" id="em-cl">
          ${!multi ? '<button class="em-ph" type="button" data-c=""><b>Определять автоматически</b><small>По месту поездки и GPS</small></button>' : ''}
          ${list.map(([c, n]) => `<button class="em-ph" type="button" data-c="${c}" data-n="${esc(n.toLowerCase())}"${sel.has(c) ? ' style="border-color:#5b4bd6;background:rgba(106,77,244,.08)"' : ''}><b>${flagImg(c)}${esc(n)}</b></button>`).join('')}</div>
        ${multi ? '<button class="st-btn st-btn-fw" type="button" data-a="ok" style="margin-top:10px">Готово</button>' : ''}`, (root, close) => {
        root.querySelector('#em-cq').addEventListener('input', e => { const v = e.target.value.trim().toLowerCase(); root.querySelectorAll('[data-n]').forEach(b => { b.style.display = !v || b.dataset.n.includes(v) ? '' : 'none'; }); });
        root.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
          if (!multi) { close(); onDone(b.dataset.c || null); return; }
          const c = b.dataset.c; sel.has(c) ? sel.delete(c) : sel.add(c);
          b.style.borderColor = sel.has(c) ? '#5b4bd6' : ''; b.style.background = sel.has(c) ? 'rgba(106,77,244,.08)' : '';
        }));
        root.querySelector('[data-a="ok"]')?.addEventListener('click', () => { close(); onDone([...sel]); });
      });
    }
    function share(extra) {
      const l = S.loc; const me = meGet();
      const url = l && l.lat != null ? `https://maps.google.com/?q=${l.lat.toFixed(6)},${l.lon.toFixed(6)}` : '';
      const text = [extra || 'Мне нужна помощь.', l && l.addr ? 'Я здесь: ' + l.addr : '', url, me.name ? '— ' + me.name : ''].filter(Boolean).join('\n');
      if (navigator.share) navigator.share({ title: 'Экстренно', text }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => ctx.toast('Сообщение с вашим местом скопировано')).catch(() => {});
    }
    function phraseFull(k) {
      const L = lang(), me = meGet();
      const t = k === 'al' ? (ALLERGY[L] || ALLERGY.en) + me.allergy : (PHRASES[k][L] || PHRASES[k].en);
      const ru = k === 'al' ? ALLERGY.ru + me.allergy : PHRASES[k].ru;
      fullScreen(`<div class="t" dir="auto">${esc(t)}</div><div class="s">${esc(ru)}</div>`, () => say(t, PHRASES[0][L] ? L : 'en'));
    }
    const phrasesHtml = () => { const L = lang(), me = meGet(); return `<div class="em-sec">Фразы на ${esc(LANG_NAME[L] || 'английском')}</div>
      ${PHRASES.map((p, k) => `<button class="em-ph" type="button" data-p="${k}"><b dir="auto">${esc(p[L] || p.en)}</b><small>${esc(p.ru)}</small></button>`).join('')}
      ${me.allergy ? `<button class="em-ph" type="button" data-p="al"><b dir="auto">${esc((ALLERGY[L] || ALLERGY.en) + me.allergy)}</b><small>${esc(ALLERGY.ru + me.allergy)}</small></button>` : ''}
      <div class="em-note">Нажмите на фразу — она откроется крупно на весь экран, её можно озвучить.</div>`; };
    const bindPhrases = body => body.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => phraseFull(b.dataset.p === 'al' ? 'al' : +b.dataset.p)));
    const locCard = (screen, withShare) => {
      const l = S.loc;
      return `<div class="em-card em-loc">${l && l.busy ? '<small>Определяю местоположение…</small>' : l ? `<b>${l.lat.toFixed(5)}, ${l.lon.toFixed(5)}</b><small>${l.addr ? esc(l.addr) + '<br>' : ''}точность ± ${l.acc} м — продиктуйте диспетчеру</small>`
        : `<small>${esc(S.locErr || 'Координаты определяются по GPS — работает и без интернета.')}</small>`}
        <div class="em-btns"><button class="st-btn" type="button" data-a="loc"><i data-lucide="locate"></i>${l && !l.busy ? 'Обновить' : 'Где я'}</button>
        ${withShare && l && l.lat != null ? '<button class="st-btn st-btn-g" type="button" data-a="share"><i data-lucide="send"></i>Отправить своё место</button>' : ''}</div></div>`;
    };

    // ======================= ЭКРАНЫ =======================
    function home() {
      ctx.openScreen({
        id: 'em-home', title: ctx.title,
        render(body, screen) {
          const me = meGet(), n = nums();
          const tiles = [['numbers', 'phone', 'Экстренные<br>номера'], ['near', 'cross', 'Ближайшие<br>больницы'], ['embassy', 'embassy', 'Посольство /<br>консульство'],
            ['insurance', 'shield', 'Страховая<br>помощь'], ['lost', 'passport', 'Потеря<br>документов'], ['report', 'warning', 'Сообщить<br>о происшествии']];
          body.innerHTML = `
            <div class="em-hero">
              <button class="em-hero-btn" type="button" data-a="back" style="left:6px" aria-label="Назад"><i data-lucide="chevron-left"></i></button>
              <button class="em-hero-btn" type="button" data-a="set" style="right:6px" aria-label="Настройки"><i data-lucide="settings"></i></button>
              <div class="em-hero-t"><h1>Экстренно</h1><p>Быстрая помощь в любой стране</p></div>
            </div>
            <a class="em-sos" href="${tel(mainNum())}" aria-label="Экстренный вызов ${esc(mainNum())}"><span class="l1"><i data-lucide="phone"></i>SOS</span><span class="l2">Экстренный вызов · ${esc(mainNum())}</span></a>
            <div class="em-grid">${tiles.map(([k, img, l]) => `<button class="em-tile" type="button" data-go="${k}"><img src="${IMG}${img}.webp" alt=""><b>${l}</b></button>`).join('')}</div>
            <button class="em-me" type="button" data-go="me"><img src="${IMG}idcard.webp" alt=""><span><b>Моя информация</b><small>${me.name ? esc(me.name) + ' · ' : ''}Паспорт, страховка, контакты</small></span><i data-lucide="chevron-right"></i></button>
            ${!n && ccNow() ? `<div class="em-note">Для страны «${esc(regionName(ccNow()))}» номеров в приложении нет — SOS набирает 112, он работает с мобильного в большинстве стран.</div>` : ''}`;
          icons(body);
          body.querySelector('[data-a="back"]').addEventListener('click', () => ctx.close());
          body.querySelector('[data-a="set"]').addEventListener('click', () => settings(screen));
          body.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => ({ numbers, near, embassy, insurance, lost, report, me: myInfo })[b.dataset.go]()));
          detectCountry(() => screen.refresh());
        }
      });
    }
    function settings(screen) {
      const cc = ccNow();
      sheet('Настройки', `<div class="em-rows" style="margin-top:8px">
          <button class="em-row" type="button" data-a="cc"><i data-lucide="map-pin" style="color:#e5262c"></i><span><b>Страна, где я сейчас</b><small>${cc ? flagImg(cc) + esc(regionName(cc)) + ' · ' + ccSource() : 'Не определена'}</small></span><i data-lucide="chevron-right"></i></button>
          <button class="em-row" type="button" data-a="me"><i data-lucide="globe" style="color:#5b4bd6"></i><span><b>Гражданство</b><small>${esc(citizenships().map(regionName).join(', ') || 'Не указано')}</small></span><i data-lucide="chevron-right"></i></button>
        </div><div class="em-note" style="margin-top:10px">Номера и фразы подстраиваются под страну. Медкарта, документы и контакты хранятся только на этом телефоне.</div>`, (root, close) => {
        root.querySelector('[data-a="cc"]').addEventListener('click', () => { close(); countrySheet(c => { S.cc = c; ctx.store.set('cc', c); S.emb = null; screen.refresh(); }); });
        root.querySelector('[data-a="me"]').addEventListener('click', () => { close(); countrySheet(list => { const m = meGet(); m.citizen = list; meSet(m); S.emb = null; screen.refresh(); }, true); });
      });
    }

    function numbers() {
      ctx.openScreen({
        title: 'Экстренные номера', onBack: home,
        render(body, screen) {
          const cc = ccNow(), n = nums() || { g: '112' };
          const rows = [];
          if (n.g) rows.push([n.g, n.p || n.a || n.f ? 'Единая экстренная служба (пожарные, полиция, скорая)' : 'Единый номер: полиция, скорая, пожарные', 'phone-call', '#e5262c', 'rgba(229,38,44,.1)']);
          if (n.p) rows.push([n.p, 'Полиция', 'shield', '#5b4bd6', 'rgba(106,77,244,.1)']); else if (n.g && rows.length) rows.push([n.g, 'Полиция', 'shield', '#5b4bd6', 'rgba(106,77,244,.1)']);
          rows.push([n.a || n.g, 'Скорая помощь', 'cross', '#e5262c', 'rgba(229,38,44,.1)']);
          rows.push([n.f || n.g, 'Пожарная служба', 'fire-extinguisher', '#e5262c', 'rgba(229,38,44,.1)']);
          (n.x || []).forEach(([l, v]) => rows.push([v, l, /мед/i.test(l) ? 'asterisk' : 'info', /мед/i.test(l) ? '#1baf7a' : '#5b4bd6', /мед/i.test(l) ? 'rgba(27,175,122,.12)' : 'rgba(106,77,244,.1)']));
          const pretty = v => /^\d{6}$/.test(v) ? v.slice(0, 3) + ' ' + v.slice(3) : v;
          const free = [...new Set([n.g, n.p].filter(Boolean))].join(' и ');
          body.innerHTML = `
            <button class="em-country" type="button" data-a="cc">${cc ? `<img src="https://flagcdn.com/w80/${cc.toLowerCase()}.png" alt="" onerror="this.replaceWith(document.createTextNode('${flagEmoji(cc)}'))">` : '<i class="f">🌍</i>'}${esc(cc ? regionName(cc) : 'Выберите страну')}</button>
            <div class="em-note" style="text-align:center;margin-top:-6px">${esc(ccSource() || 'выберите страну')} · нажмите на страну, чтобы сменить</div>
            ${S.ccGps && S.ccGps !== cc ? `<button class="em-ph" type="button" data-a="gps"><b>${flagImg(S.ccGps)}Вы сейчас в стране: ${esc(regionName(S.ccGps))}</b><small>Показать номера этой страны</small></button>` : ''}
            <div class="em-list">${rows.filter(r => r[0]).map(([v, l, ic, col, bg]) => `<a class="em-num" href="${tel(v)}"><span class="em-ic" style="background:${bg};color:${col}"><i data-lucide="${ic}"></i></span><span><b>${esc(pretty(v))}</b><small>${esc(l)}</small></span><span class="em-call"><i data-lucide="phone"></i></span></a>`).join('')}</div>
            <div class="em-info"><i data-lucide="info"></i><span>Звонки на ${esc(free || '112')} бесплатны и доступны даже без SIM-карты.</span></div>
            ${!nums() ? '<div class="em-note">Для этой страны номеров в приложении нет — показан 112. Выберите страну вверху или уточните номер на месте.</div>' : '<div class="em-note">Номера — из открытого списка экстренных номеров. На месте их подтвердит отель или любой местный житель.</div>'}`;
          icons(body);
          body.querySelector('[data-a="cc"]').addEventListener('click', () => countrySheet(c => { S.cc = c; ctx.store.set('cc', c); screen.refresh(); }));
          body.querySelector('[data-a="gps"]')?.addEventListener('click', () => { S.cc = S.ccGps; ctx.store.set('cc', S.cc); screen.refresh(); });
          if (!S.ccTrip) detectCountry(() => screen.refresh());
        }
      });
    }

    function near() {
      ctx.openScreen({
        title: 'Ближайшие больницы', onBack: home,
        render(body, screen) {
          screen.near = true;
          const l = S.loc, nr = S.near;
          const row = (i, ic, col, label) => `<div class="em-pl"><i data-lucide="${ic}" style="color:${col}"></i><span>${esc(i.name || label)}<small>${esc(label)} · ${kmTxt(i.km)}${i.em ? ' · приёмное отделение' : ''}</small></span>
            ${i.phone ? `<a href="${tel(i.phone.split(';')[0])}" aria-label="Позвонить"><i data-lucide="phone"></i></a>` : ''}<a href="https://www.google.com/maps/dir/?api=1&destination=${i.lat},${i.lon}&travelmode=walking" target="_blank" rel="noopener" aria-label="Маршрут"><i data-lucide="navigation"></i></a></div>`;
          const mapQ = q => l && l.lat != null ? `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${l.lat},${l.lon},15z` : `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
          body.innerHTML = `${locCard(screen, false)}
            <div class="em-card">
              ${!l || l.lat == null ? '<div class="st-muted">Нажмите «Где я» — покажу ближайшие больницы, аптеки и полицию.</div>'
                : nr && nr.busy ? '<div class="st-muted">Ищу рядом…</div>'
                : nr && nr.err ? '<div class="st-muted">Сервис карт не ответил. Откройте поиск на карте:</div>'
                : nr ? ([...nr.hospital.map(i => row(i, 'hospital', '#e5262c', 'Больница')), ...nr.pharmacy.map(i => row(i, 'pill', '#1baf7a', 'Аптека')), ...nr.police.map(i => row(i, 'shield', '#2a78d6', 'Полиция'))].join('') || '<div class="st-muted">Поблизости ничего не нашлось — откройте поиск на карте:</div>') : ''}
              <div class="em-maps"><a href="${esc(mapQ('hospital'))}" target="_blank" rel="noopener"><i data-lucide="hospital"></i>Больницы</a><a href="${esc(mapQ('pharmacy'))}" target="_blank" rel="noopener"><i data-lucide="pill"></i>Аптеки</a><a href="${esc(mapQ('police'))}" target="_blank" rel="noopener"><i data-lucide="shield"></i>Полиция</a></div>
            </div>
            <a class="em-num" href="${tel((nums() || {}).a || mainNum())}"><span class="em-ic" style="background:rgba(229,38,44,.1);color:#e5262c"><i data-lucide="ambulance"></i></span><span><b>${esc((nums() || {}).a || mainNum())}</b><small>Вызвать скорую помощь</small></span><span class="em-call"><i data-lucide="phone"></i></span></a>`;
          icons(body);
          body.querySelector('[data-a="loc"]').addEventListener('click', () => locate(screen));
          if (!S.loc && !S.locErr) locate(screen); else if (S.loc && S.loc.lat != null && !S.near) nearby(screen);
        }
      });
    }

    function embassy() {
      ctx.openScreen({
        title: 'Посольство / консульство', onBack: home,
        render(body, screen) {
          const cc = ccNow(), list = citizenships(), e = S.emb;
          const homes = list.filter(h => h !== cc);
          body.innerHTML = `
            <div class="em-rows"><button class="em-row" type="button" data-a="cit"><i data-lucide="globe" style="color:#5b4bd6"></i><span><b>Гражданство</b><small>${esc(list.map(regionName).join(', ') || 'Не указано — нажмите, чтобы выбрать')}</small></span><i data-lucide="chevron-right"></i></button>
              <button class="em-row" type="button" data-a="cc"><i data-lucide="map-pin" style="color:#e5262c"></i><span><b>Страна пребывания</b><small>${cc ? flagImg(cc) + esc(regionName(cc)) : 'Не определена'}</small></span><i data-lucide="chevron-right"></i></button></div>
            <div class="em-card">
              ${!list.length ? '<div class="st-muted">Укажите гражданство — найду посольства и консульства вашей страны в стране пребывания.</div>'
                : !homes.length ? '<div class="st-muted">Вы в стране своего гражданства — посольство не нужно.</div>'
                : e && e.busy ? '<div class="st-muted">Ищу посольства…</div>'
                : e && e.list && e.list.length ? e.list.map(o => `<div class="em-pl"><i data-lucide="landmark" style="color:#5b4bd6"></i><span>${esc(o.name)}<small>${esc([o.addr, o.city].filter(Boolean).join(', ') || 'адрес — на сайте')}</small></span>
                    ${o.phone ? `<a href="${tel(o.phone)}" aria-label="Позвонить"><i data-lucide="phone"></i></a>` : ''}${o.site ? `<a href="${esc(o.site)}" target="_blank" rel="noopener" aria-label="Сайт"><i data-lucide="globe"></i></a>` : ''}${o.lat ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lon}" target="_blank" rel="noopener" aria-label="Маршрут"><i data-lucide="navigation"></i></a>` : ''}</div>`).join('')
                : e ? '<div class="st-muted">В открытых данных не нашлось.</div>' : ''}
              ${homes.length && e && !e.busy ? `<div class="em-btns">${homes.map(h => `<a class="st-btn st-btn-g" href="https://www.google.com/search?q=${encodeURIComponent('посольство ' + regionName(h) + ' в ' + regionName(cc))}" target="_blank" rel="noopener"><i data-lucide="search"></i>${esc(regionName(h))}: искать в интернете</a>`).join('')}</div>` : ''}
            </div>
            <div class="em-note">Посольство поможет при потере паспорта (временный документ на возвращение), аресте, тяжёлой болезни или если нужна связь с родными.</div>`;
          icons(body);
          body.querySelector('[data-a="cit"]').addEventListener('click', () => countrySheet(l => { const m = meGet(); m.citizen = l; meSet(m); S.emb = null; screen.refresh(); }, true));
          body.querySelector('[data-a="cc"]').addEventListener('click', () => countrySheet(c => { S.cc = c; ctx.store.set('cc', c); S.emb = null; screen.refresh(); }));
          if (homes.length && cc && !S.emb) embassies(screen);
        }
      });
    }

    function insurance() {
      ctx.openScreen({
        title: 'Страховая помощь', onBack: home,
        render(body, screen) {
          const m = meGet();
          body.innerHTML = m.ins || m.hotline || m.policy ? `
            <div class="em-rows">
              <div class="em-row"><img src="${IMG}shield.webp" alt="" style="width:40px;height:40px"><span><b>${esc(m.ins || 'Страховка')}</b><small>${m.policy ? 'Полис ' + esc(m.policy) : ''}${m.insUntil ? (m.policy ? ' · ' : '') + 'до ' + esc(dateRu(m.insUntil)) : ''}</small></span></div>
            </div>
            ${m.hotline ? `<a class="em-num" href="${tel(m.hotline)}"><span class="em-ic" style="background:rgba(106,77,244,.1);color:#5b4bd6"><i data-lucide="headset"></i></span><span><b>${esc(m.hotline)}</b><small>Горячая линия страховой 24/7</small></span><span class="em-call"><i data-lucide="phone"></i></span></a>` : ''}
            <div class="em-sec">Что делать</div>
            <div class="em-steps">
              <div class="em-step"><b>Угроза жизни — сначала ${esc(mainNum())}</b><small>Скорую вызывайте сразу, страховую — когда вы в безопасности.</small></div>
              <div class="em-step"><b>Позвоните в страховую до визита к врачу</b><small>Назовите номер полиса и где вы находитесь — вам подскажут клинику, которая работает со страховой.</small></div>
              <div class="em-step"><b>Сохраняйте все документы</b><small>Счета, чеки из аптеки, заключение врача — сфотографируйте их во вкладку «Документы».</small></div>
            </div>
            <button class="st-btn st-btn-g st-btn-fw" type="button" data-a="edit"><i data-lucide="pencil"></i>Изменить данные страховки</button>`
            : `<div class="em-card" style="text-align:center;padding:26px 16px"><img src="${IMG}shield.webp" alt="" style="width:64px;height:64px"><h3 style="margin-top:8px">Страховка не добавлена</h3><div class="st-muted">Добавьте страховую компанию, номер полиса и телефон горячей линии — позвонить можно будет одним нажатием.</div>
              <button class="st-btn st-btn-fw" type="button" data-a="edit" style="margin-top:14px"><i data-lucide="plus"></i>Добавить страховку</button></div>`;
          icons(body);
          body.querySelector('[data-a="edit"]').addEventListener('click', () => editMe(screen, 'ins'));
        }
      });
    }

    function lost() {
      ctx.openScreen({
        title: 'Потеря документов', onBack: home,
        render(body, screen) {
          const n = nums() || {};
          body.innerHTML = `
            <div class="em-steps">
              <div class="em-step"><b>Заявите в полицию</b><small>Попросите справку о потере или краже — она нужна посольству и страховой.</small>
                <div class="em-btns"><a class="st-btn" href="${tel(n.p || mainNum())}"><i data-lucide="phone"></i>Полиция ${esc(n.p || mainNum())}</a><button class="st-btn st-btn-g" type="button" data-a="near"><i data-lucide="map-pin"></i>Ближайшая</button></div></div>
              <div class="em-step"><b>Обратитесь в посольство или консульство</b><small>Там оформят временный документ для возвращения домой. Возьмите справку из полиции и фото.</small>
                <div class="em-btns"><button class="st-btn st-btn-g" type="button" data-a="emb"><i data-lucide="landmark"></i>Посольство</button></div></div>
              <div class="em-step"><b>Заблокируйте банковские карты</b><small>Позвоните в банк по номеру с сайта банка или заблокируйте карту в его приложении.</small></div>
              <div class="em-step"><b>Покажите копии документов</b><small>Копии паспорта и страховки из «Моей информации» ускорят оформление.</small>
                <div class="em-btns"><button class="st-btn st-btn-g" type="button" data-a="docs"><i data-lucide="file-text"></i>Мои документы</button></div></div>
            </div>
            <div class="em-sec">Фразы</div>
            ${[5, 4, 2].map(k => `<button class="em-ph" type="button" data-p="${k}"><b dir="auto">${esc(PHRASES[k][lang()] || PHRASES[k].en)}</b><small>${esc(PHRASES[k].ru)}</small></button>`).join('')}`;
          icons(body);
          body.querySelector('[data-a="near"]').addEventListener('click', near);
          body.querySelector('[data-a="emb"]').addEventListener('click', embassy);
          body.querySelector('[data-a="docs"]').addEventListener('click', () => { S.tab = 'docs'; myInfo(); });
          bindPhrases(body);
        }
      });
    }

    function report() {
      ctx.openScreen({
        title: 'Сообщить о происшествии', onBack: home,
        render(body, screen) {
          const n = nums() || {}, contacts = meGet().contacts || [];
          body.innerHTML = `${locCard(screen, true)}
            <div class="em-list">
              <a class="em-num" href="${tel(n.p || mainNum())}"><span class="em-ic" style="background:rgba(106,77,244,.1);color:#5b4bd6"><i data-lucide="shield"></i></span><span><b>${esc(n.p || mainNum())}</b><small>Сообщить в полицию</small></span><span class="em-call"><i data-lucide="phone"></i></span></a>
              <a class="em-num" href="${tel(mainNum())}"><span class="em-ic" style="background:rgba(229,38,44,.1);color:#e5262c"><i data-lucide="phone-call"></i></span><span><b>${esc(mainNum())}</b><small>Экстренный вызов</small></span><span class="em-call"><i data-lucide="phone"></i></span></a>
            </div>
            <div class="em-sec">Сообщить близким</div>
            <div class="em-rows">${contacts.length ? contacts.map((c, k) => `<div class="em-row"><i data-lucide="user-round" style="color:#5b4bd6"></i><span><b>${esc(c.name)}</b><small>${esc([c.rel, c.phone].filter(Boolean).join(' · '))}</small></span>
                ${c.phone ? `<a class="em-call" href="${tel(c.phone)}" aria-label="Позвонить"><i data-lucide="phone"></i></a><a class="em-call" href="sms:${esc(c.phone.replace(/[^\d+]/g, ''))}?body=${encodeURIComponent('Мне нужна помощь. ' + (S.loc && S.loc.lat != null ? 'Я здесь: https://maps.google.com/?q=' + S.loc.lat.toFixed(6) + ',' + S.loc.lon.toFixed(6) : ''))}" aria-label="SMS"><i data-lucide="message-square"></i></a>` : ''}</div>`).join('')
              : '<button class="em-row" type="button" data-a="contacts"><i data-lucide="user-plus" style="color:#5b4bd6"></i><span><b>Добавить контакты близких</b><small>Позвонить или отправить SMS с вашим местом одним нажатием</small></span><i data-lucide="chevron-right"></i></button>'}</div>
            <button class="st-btn st-btn-fw" type="button" data-a="sendall"><i data-lucide="send"></i>Отправить «Мне нужна помощь» с моим местом</button>
            ${phrasesHtml()}`;
          icons(body);
          body.querySelector('[data-a="loc"]').addEventListener('click', () => locate(screen));
          body.querySelector('[data-a="share"]')?.addEventListener('click', () => share());
          body.querySelector('[data-a="sendall"]').addEventListener('click', () => share());
          body.querySelector('[data-a="contacts"]')?.addEventListener('click', () => { S.tab = 'contacts'; myInfo(); });
          bindPhrases(body);
          if (!S.loc && !S.locErr) locate(screen);
        }
      });
    }

    // ---------- Моя информация ----------
    function editMe(screen, focus) {
      const m = meGet();
      const f = (k, l, ph, type) => `<div><label for="em-${k}">${esc(l)}</label><input class="st-input" id="em-${k}" ${type ? 'type="' + type + '"' : ''} value="${esc(m[k] || '')}" placeholder="${esc(ph || '')}"></div>`;
      sheet('Моя информация', `<div class="em-note" style="margin:0 2px 10px">Хранится только на этом телефоне и никуда не отправляется.</div>
        <div class="em-form">
          ${f('name', 'ФИО (латиницей, как в паспорте)', 'Rafael Babaew')}${f('birth', 'Дата рождения', '', 'date')}
          ${f('passport', 'Номер паспорта (по желанию)', '')}
          ${f('ins', 'Страховая компания', 'Allianz Travel')}${f('policy', 'Номер полиса', '')}${f('insUntil', 'Страховка действует до', '', 'date')}${f('hotline', 'Телефон страховой 24/7', '+49 …', 'tel')}
          ${f('allergy', 'Аллергии / важное', 'Пенициллин')}${f('blood', 'Группа крови', 'A (III) Rh+')}${f('meds', 'Принимаю лекарства', '')}${f('cond', 'Хронические заболевания', '')}
        </div>
        <button class="st-btn st-btn-fw" type="button" data-a="ok" style="margin-top:12px"><i data-lucide="check"></i>Сохранить</button>`, (root, close) => {
        if (focus) setTimeout(() => root.querySelector('#em-' + focus)?.focus(), 250);
        root.querySelector('[data-a="ok"]').addEventListener('click', () => {
          const o = meGet(); ['name', 'birth', 'passport', 'ins', 'policy', 'insUntil', 'hotline', 'allergy', 'blood', 'meds', 'cond'].forEach(k => { const v = root.querySelector('#em-' + k).value.trim(); if (v) o[k] = v; else delete o[k]; });
          meSet(o); close(); screen.refresh(); ctx.toast('Сохранено на этом телефоне');
        });
      });
    }
    function contactSheet(screen, idx) {
      const m = meGet(), list = m.contacts || [], c = idx != null ? list[idx] : {};
      sheet(idx != null ? 'Контакт' : 'Новый контакт', `<div class="em-form">
          <div><label>Имя</label><input class="st-input" id="em-cn" value="${esc(c.name || '')}" placeholder="Мама"></div>
          <div><label>Кем приходится</label><input class="st-input" id="em-cr" value="${esc(c.rel || '')}" placeholder="мама, брат, друг"></div>
          <div><label>Телефон</label><input class="st-input" id="em-cp" type="tel" value="${esc(c.phone || '')}" placeholder="+49 …"></div></div>
        <button class="st-btn st-btn-fw" type="button" data-a="ok" style="margin-top:12px"><i data-lucide="check"></i>Сохранить</button>
        ${idx != null ? '<button class="st-btn st-btn-g st-btn-fw" type="button" data-a="del" style="margin-top:8px;color:#e5262c">Удалить</button>' : ''}`, (root, close) => {
        root.querySelector('[data-a="ok"]').addEventListener('click', () => {
          const o = { name: root.querySelector('#em-cn').value.trim(), rel: root.querySelector('#em-cr').value.trim(), phone: root.querySelector('#em-cp').value.trim() };
          if (!o.name || !o.phone) { ctx.toast('Укажите имя и телефон'); return; }
          const mm = meGet(); mm.contacts = mm.contacts || []; if (idx != null) mm.contacts[idx] = o; else mm.contacts.push(o); meSet(mm); close(); screen.refresh();
        });
        root.querySelector('[data-a="del"]')?.addEventListener('click', () => { const mm = meGet(); mm.contacts.splice(idx, 1); meSet(mm); close(); screen.refresh(); });
      });
    }
    function addDoc(screen) {
      sheet('Добавить документ', `<div class="em-form">
          <div><label>Что это</label><select class="st-input" id="em-dk">${DOC_KINDS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
          <div><label>Фото или PDF</label><input class="st-input" id="em-df" type="file" accept="image/*,application/pdf" style="padding-top:11px"></div></div>
        <div class="em-note" style="margin-top:8px">Файл хранится только на этом телефоне. Удобно сфотографировать разворот паспорта и полис.</div>
        <button class="st-btn st-btn-fw" type="button" data-a="ok" style="margin-top:12px"><i data-lucide="upload"></i>Сохранить</button>`, (root, close) => {
        root.querySelector('[data-a="ok"]').addEventListener('click', async () => {
          const file = root.querySelector('#em-df').files[0]; if (!file) { ctx.toast('Выберите файл'); return; }
          if (file.size > 15 * 1024 * 1024) { ctx.toast('Файл больше 15 МБ — выберите поменьше'); return; }
          const kind = root.querySelector('#em-dk').value, id = 'd' + Date.now().toString(36);
          try {
            await idb('readwrite', st => st.put(file, id));
            const m = meGet(); m.docs = m.docs || []; m.docs.push({ id, kind, name: file.name, type: file.type, t: Date.now() }); meSet(m);
            close(); screen.refresh(); ctx.toast('Документ сохранён на телефоне');
          } catch (_) { ctx.toast('Не удалось сохранить файл'); }
        });
      });
    }
    async function openDoc(d) {
      try {
        const blob = await idb('readonly', st => st.get(d.id)); if (!blob) { ctx.toast('Файл не найден на этом устройстве'); return; }
        const url = URL.createObjectURL(blob);
        if ((d.type || '').startsWith('image/')) { const el = fullScreen(`<img class="doc" src="${url}" alt="">`); el.addEventListener('click', e => { if (e.target === el) { URL.revokeObjectURL(url); el.remove(); } }); }
        else window.open(url, '_blank', 'noopener');
      } catch (_) { ctx.toast('Не удалось открыть файл'); }
    }
    function showQR() {
      const m = meGet();
      const lines = [m.name && 'Name: ' + m.name, m.birth && 'Born: ' + m.birth, citizenships().length && 'Citizenship: ' + citizenships().join(', '), m.blood && 'Blood type: ' + m.blood,
        m.allergy && 'Allergies: ' + m.allergy, m.meds && 'Medications: ' + m.meds, m.cond && 'Conditions: ' + m.cond, m.ins && 'Insurance: ' + m.ins + (m.policy ? ' #' + m.policy : ''), m.hotline && 'Insurance hotline: ' + m.hotline,
        (m.contacts || [])[0] && 'Emergency contact: ' + m.contacts[0].name + ' ' + m.contacts[0].phone].filter(Boolean);
      if (!lines.length) { ctx.toast('Сначала заполните свои данные'); return; }
      const el = fullScreen(`<div style="font-size:1.4rem;font-weight:800;margin-bottom:6px">Medical &amp; emergency info</div><div class="s" style="margin:0 0 16px">Наведите камеру телефона на код — откроется текст</div><div id="em-qrbox" style="background:#fff;padding:12px;border-radius:16px"></div>
        <div class="s" style="text-align:left;max-width:420px;white-space:pre-line;color:#222;font-size:.95rem">${esc(lines.join('\n'))}</div>`);
      // qrcodejs неверно считает длину кириллицы — пробуем как есть, затем латиницей (иностранному врачу так даже понятнее)
      const box = el.querySelector('#em-qrbox'), text = lines.join('\n');
      const tries = [[text, QRCode.CorrectLevel.M], [text, QRCode.CorrectLevel.L], [translit(text), QRCode.CorrectLevel.L]];
      let ok = false;
      for (const [t, lvl] of tries) { try { box.innerHTML = ''; new QRCode(box, { text: t, width: 240, height: 240, correctLevel: lvl }); ok = true; break; } catch (_) {} }
      if (!ok) box.remove();
    }
    function myInfo() {
      ctx.openScreen({
        title: 'Моя информация', onBack: home,
        action: { icon: 'pencil', label: 'Изменить', onClick: screen => editMe(screen) },
        render(body, screen) {
          const m = meGet(), docs = m.docs || [], tab = S.tab;
          const pass = docs.filter(d => d.kind === 'passport').length;
          let inner = '';
          if (tab === 'data') inner = `<div class="em-rows">
              <button class="em-row" type="button" data-e="name"><i data-lucide="user-round" style="color:#2a2f6b"></i><span><b>ФИО</b><small>${esc(m.name || 'Не указано')}</small></span></button>
              <button class="em-row" type="button" data-a="cit"><i data-lucide="globe" style="color:#2a2f6b"></i><span><b>Гражданство</b><small>${esc(citizenships().map(regionName).join(', ') || 'Не указано')}</small></span></button>
              <button class="em-row" type="button" data-a="tdocs"><i data-lucide="contact-round" style="color:#2a2f6b"></i><span><b>Паспорт</b><small>${pass ? 'Сохранён (' + pass + ' ' + (pass === 1 ? 'файл' : pass < 5 ? 'файла' : 'файлов') + ')' : m.passport ? '№ ' + esc(m.passport) : 'Не добавлен'}</small></span><i data-lucide="chevron-right"></i></button>
              <button class="em-row" type="button" data-a="ins"><i data-lucide="shield-check" style="color:#2a2f6b"></i><span><b>Страховка</b><small>${m.ins ? esc(m.ins) + (m.insUntil ? ' (до ' + esc(dateRu(m.insUntil)) + ')' : '') : 'Не добавлена'}</small></span><i data-lucide="chevron-right"></i></button>
              <button class="em-row" type="button" data-e="allergy"><i data-lucide="asterisk" style="color:#e5262c"></i><span><b>Аллергии / важное</b><small>${esc([m.allergy, m.meds && 'лекарства: ' + m.meds, m.cond].filter(Boolean).join(' · ') || 'Не указано')}</small></span></button>
              <button class="em-row" type="button" data-e="blood"><i data-lucide="triangle-alert" style="color:#e5262c"></i><span><b>Группа крови</b><small>${esc(m.blood || 'Не указана')}</small></span></button>
            </div>
            <button class="em-qr" type="button" data-a="qr"><i data-lucide="qr-code"></i><span><b>Показать QR-карту</b><small>с основной информацией</small></span></button>`;
          else if (tab === 'docs') inner = `<div class="em-card">${docs.length ? docs.map(d => `<div class="em-doc"><button class="th" type="button" data-o="${d.id}"><i data-lucide="${(d.type || '').startsWith('image/') ? 'image' : 'file-text'}"></i></button><span><b>${esc((DOC_KINDS.find(k => k[0] === d.kind) || DOC_KINDS[4])[1])}</b><small>${esc(d.name || '')}</small></span><button class="x" type="button" data-d="${d.id}" aria-label="Удалить"><i data-lucide="trash-2"></i></button></div>`).join('')
              : '<div class="st-muted">Сфотографируйте паспорт, визу и страховой полис — копии пригодятся при потере документов и в больнице.</div>'}</div>
            <button class="st-btn st-btn-fw" type="button" data-a="adddoc"><i data-lucide="plus"></i>Добавить документ</button>`;
          else inner = `<div class="em-rows">${(m.contacts || []).length ? m.contacts.map((c, k) => `<div class="em-row"><i data-lucide="user-round" style="color:#5b4bd6"></i><span><b>${esc(c.name)}</b><small>${esc([c.rel, c.phone].filter(Boolean).join(' · '))}</small></span><a class="em-call" href="${tel(c.phone)}" aria-label="Позвонить"><i data-lucide="phone"></i></a><button class="em-call" type="button" data-c="${k}" style="border:0;cursor:pointer" aria-label="Изменить"><i data-lucide="pencil"></i></button></div>`).join('')
              : '<div class="em-row"><i data-lucide="users" style="color:#5b4bd6"></i><span><b>Контактов пока нет</b><small>Добавьте близких, с кем связаться в экстренной ситуации</small></span></div>'}</div>
            <button class="st-btn st-btn-fw" type="button" data-a="addc"><i data-lucide="user-plus"></i>Добавить контакт</button>`;
          body.innerHTML = `<div class="em-tabs">${[['data', 'Данные'], ['docs', 'Документы'], ['contacts', 'Контакты']].map(([k, l]) => `<button type="button" data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>${inner}
            <div class="em-note">Все эти данные хранятся только на этом телефоне и никуда не отправляются.</div>`;
          icons(body);
          body.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { S.tab = b.dataset.t; screen.refresh(); }));
          body.querySelectorAll('[data-e]').forEach(b => b.addEventListener('click', () => editMe(screen, b.dataset.e)));
          body.querySelector('[data-a="cit"]')?.addEventListener('click', () => countrySheet(l => { const mm = meGet(); mm.citizen = l; meSet(mm); S.emb = null; screen.refresh(); }, true));
          body.querySelector('[data-a="tdocs"]')?.addEventListener('click', () => { S.tab = 'docs'; screen.refresh(); });
          body.querySelector('[data-a="ins"]')?.addEventListener('click', insurance);
          body.querySelector('[data-a="qr"]')?.addEventListener('click', showQR);
          body.querySelector('[data-a="adddoc"]')?.addEventListener('click', () => addDoc(screen));
          body.querySelectorAll('[data-o]').forEach(b => b.addEventListener('click', () => openDoc((meGet().docs || []).find(d => d.id === b.dataset.o))));
          body.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', async () => {
            if (!confirm('Удалить этот документ с телефона?')) return;
            try { await idb('readwrite', st => st.delete(b.dataset.d)); } catch (_) {}
            const mm = meGet(); mm.docs = (mm.docs || []).filter(d => d.id !== b.dataset.d); meSet(mm); screen.refresh();
          }));
          body.querySelector('[data-a="addc"]')?.addEventListener('click', () => contactSheet(screen));
          body.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => contactSheet(screen, +b.dataset.c)));
        }
      });
    }

    home();
  });
})();
