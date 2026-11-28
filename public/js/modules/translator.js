// ============================================================
// Модуль «Переводчик» (id: 'translator')
// Текст (автоопределение языка), Разговор (голос ↔ голос), Камера (текст с фото),
// Фразы (разговорник), Избранное и история, языки для офлайна.
// Всё бесплатно и без ключей:
//   • перевод на устройстве — встроенный переводчик Chrome (Translator API), работает без интернета;
//   • онлайн-перевод — MyMemory (api.mymemory.translated.net, без ключа, ~5000 символов в день);
//   • разговорник — встроен в приложение (7 языков) или скачивается один раз;
//   • текст с фото — Tesseract.js из /vendor/tesseract (файлы языков лежат в приложении);
//   • голос — распознавание и озвучка средствами браузера.
// Избранное и история хранятся только на этом устройстве (localStorage).
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const ID = 'translator';
  const IMG = '/img/translator/';
  const OCR = '/vendor/tesseract/';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = el => { if (typeof initializeIcons === 'function') initializeIcons(el); };
  const online = () => navigator.onLine !== false;
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('st_tr_' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('st_tr_' + k, JSON.stringify(v)); } catch (_) {} }
  };

  // ---------- Языки: n — название, cc — флаг, v — голос, o — файл распознавания текста ----------
  const L = {
    ru: { n: 'Русский', cc: 'ru', v: 'ru-RU' }, en: { n: 'Английский', cc: 'gb', v: 'en-GB', o: 'eng' },
    de: { n: 'Немецкий', cc: 'de', v: 'de-DE', o: 'deu' }, fr: { n: 'Французский', cc: 'fr', v: 'fr-FR', o: 'fra' },
    es: { n: 'Испанский', cc: 'es', v: 'es-ES', o: 'spa' }, it: { n: 'Итальянский', cc: 'it', v: 'it-IT', o: 'ita' },
    pt: { n: 'Португальский', cc: 'pt', v: 'pt-PT', o: 'por' }, nl: { n: 'Нидерландский', cc: 'nl', v: 'nl-NL', o: 'nld' },
    pl: { n: 'Польский', cc: 'pl', v: 'pl-PL', o: 'pol' }, cs: { n: 'Чешский', cc: 'cz', v: 'cs-CZ', o: 'ces' },
    hr: { n: 'Хорватский', cc: 'hr', v: 'hr-HR', o: 'hrv' }, tr: { n: 'Турецкий', cc: 'tr', v: 'tl-TR', o: 'tur' },
    el: { n: 'Греческий', cc: 'gr', v: 'el-GR', o: 'ell' }, uk: { n: 'Украинский', cc: 'ua', v: 'uk-UA' },
    ka: { n: 'Грузинский', cc: 'ge', v: 'ka-GE' }, hy: { n: 'Армянский', cc: 'am', v: 'hy-AM' },
    ja: { n: 'Японский', cc: 'jp', v: 'ja-JP' }, zh: { n: 'Китайский', cc: 'cn', v: 'zh-CN' }, ar: { n: 'Арабский', cc: 'ae', v: 'ar-SA' },
    sr: { n: 'Сербский', cc: 'rs', v: 'sr-RS' }, bs: { n: 'Боснийский', cc: 'ba', v: 'bs-BA' }, sl: { n: 'Словенский', cc: 'si', v: 'sl-SI' },
    sk: { n: 'Словацкий', cc: 'sk', v: 'sk-SK' }, bg: { n: 'Болгарский', cc: 'bg', v: 'bg-BG' }, ro: { n: 'Румынский', cc: 'ro', v: 'ro-RO' },
    hu: { n: 'Венгерский', cc: 'hu', v: 'hu-HU' }, da: { n: 'Датский', cc: 'dk', v: 'da-DK' }, sv: { n: 'Шведский', cc: 'se', v: 'sv-SE' },
    no: { n: 'Норвежский', cc: 'no', v: 'nb-NO' }, fi: { n: 'Финский', cc: 'fi', v: 'fi-FI' }, is: { n: 'Исландский', cc: 'is', v: 'is-IS' },
    et: { n: 'Эстонский', cc: 'ee', v: 'et-EE' }, lv: { n: 'Латышский', cc: 'lv', v: 'lv-LV' }, lt: { n: 'Литовский', cc: 'lt', v: 'lt-LT' },
    sq: { n: 'Албанский', cc: 'al', v: 'sq-AL' }, mk: { n: 'Македонский', cc: 'mk', v: 'mk-MK' }, mt: { n: 'Мальтийский', cc: 'mt', v: 'mt-MT' },
    he: { n: 'Иврит', cc: 'il', v: 'he-IL' }, fa: { n: 'Персидский', cc: 'ir', v: 'fa-IR' }, hi: { n: 'Хинди', cc: 'in', v: 'hi-IN' },
    bn: { n: 'Бенгальский', cc: 'bd', v: 'bn-BD' }, ur: { n: 'Урду', cc: 'pk', v: 'ur-PK' }, ta: { n: 'Тамильский', cc: 'in', v: 'ta-IN' },
    te: { n: 'Телугу', cc: 'in', v: 'te-IN' }, ml: { n: 'Малаялам', cc: 'in', v: 'ml-IN' }, mr: { n: 'Маратхи', cc: 'in', v: 'mr-IN' },
    gu: { n: 'Гуджарати', cc: 'in', v: 'gu-IN' }, ne: { n: 'Непальский', cc: 'np', v: 'ne-NP' }, si: { n: 'Сингальский', cc: 'lk', v: 'si-LK' },
    th: { n: 'Тайский', cc: 'th', v: 'th-TH' }, vi: { n: 'Вьетнамский', cc: 'vn', v: 'vi-VN' }, id: { n: 'Индонезийский', cc: 'id', v: 'id-ID' },
    ms: { n: 'Малайский', cc: 'my', v: 'ms-MY' }, tl: { n: 'Филиппинский', cc: 'ph', v: 'fil-PH' }, ko: { n: 'Корейский', cc: 'kr', v: 'ko-KR' },
    km: { n: 'Кхмерский', cc: 'kh', v: 'km-KH' }, lo: { n: 'Лаосский', cc: 'la', v: 'lo-LA' }, my: { n: 'Бирманский', cc: 'mm', v: 'my-MM' },
    sw: { n: 'Суахили', cc: 'ke', v: 'sw-KE' }, am: { n: 'Амхарский', cc: 'et', v: 'am-ET' }, af: { n: 'Африкаанс', cc: 'za', v: 'af-ZA' },
    zu: { n: 'Зулу', cc: 'za', v: 'zu-ZA' }, az: { n: 'Азербайджанский', cc: 'az', v: 'az-AZ' }, kk: { n: 'Казахский', cc: 'kz', v: 'kk-KZ' },
    uz: { n: 'Узбекский', cc: 'uz', v: 'uz-UZ' }, ky: { n: 'Киргизский', cc: 'kg', v: 'ky-KG' }, mn: { n: 'Монгольский', cc: 'mn', v: 'mn-MN' }
  };
  const CODES = Object.keys(L);
  const CC_LANG = { DE:'de', AT:'de', CH:'de', LI:'de', FR:'fr', BE:'fr', LU:'fr', MC:'fr', MA:'ar', TN:'ar', DZ:'ar', ES:'es', AD:'es', MX:'es', AR:'es', CU:'es', DO:'es', CO:'es', CL:'es', PE:'es', VE:'es', UY:'es', PY:'es', BO:'es', EC:'es', GT:'es', CR:'es', PA:'es', HN:'es', NI:'es', SV:'es',
    IT:'it', SM:'it', VA:'it', PT:'pt', BR:'pt', NL:'nl', PL:'pl', CZ:'cs', SK:'sk', HR:'hr', SI:'sl', BA:'bs', RS:'sr', ME:'sr', TR:'tr', GR:'el', CY:'el', BG:'bg', RO:'ro', MD:'ro', HU:'hu', DK:'da', SE:'sv', NO:'no', FI:'fi', IS:'is', EE:'et', LV:'lv', LT:'lt', AL:'sq', MK:'mk', MT:'mt',
    UA:'uk', GE:'ka', AM:'hy', JP:'ja', CN:'zh', HK:'zh', TW:'zh', AE:'ar', SA:'ar', QA:'ar', EG:'ar', JO:'ar', LB:'ar', IQ:'ar', SY:'ar', OM:'ar', BH:'ar', KW:'ar', YE:'ar', LY:'ar', SD:'ar', RU:'ru', BY:'ru', KZ:'kk', KG:'ky', AZ:'az', UZ:'uz', MN:'mn', IL:'he', IR:'fa', IN:'hi', PK:'ur', BD:'bn', NP:'ne', LK:'si', TH:'th', VN:'vi', ID:'id', MY:'ms', PH:'tl', KR:'ko', KH:'km', LA:'lo', MM:'my', KE:'sw', TZ:'sw', ET:'am', ZA:'af', US:'en', GB:'en', IE:'en', AU:'en', NZ:'en', CA:'en', SG:'en' };
  const flag = (c, cls) => `<img class="${cls || 'tl-flag'}" src="https://flagcdn.com/w80/${L[c] ? L[c].cc : 'un'}.png" alt="" onerror="this.style.visibility='hidden'">`;
  const nm = c => (L[c] ? L[c].n : c);
  const regionName = cc => { try { return new Intl.DisplayNames(['ru'], { type: 'region' }).of(cc); } catch (_) { return cc; } };

  // ---------- Разговорник: 50 фраз, встроены на 7 языках ----------
  const CATS = [['basic', 'Основное', 'message-circle'], ['hotel', 'Отель', 'bed-double'], ['food', 'Ресторан', 'utensils'], ['transport', 'Транспорт', 'bus'], ['shop', 'Покупки', 'shopping-bag'], ['city', 'В городе', 'map-pin'], ['social', 'Знакомство', 'smile'], ['sos', 'Экстренно', 'siren']];
  const PH = [
    ['basic', 'Здравствуйте!'], ['basic', 'Спасибо!'], ['basic', 'Извините.'], ['basic', 'Да / Нет'], ['basic', 'Я не понимаю.'], ['basic', 'Пожалуйста, говорите медленнее.'], ['basic', 'Сколько это стоит?'], ['basic', 'Где туалет?'],
    ['hotel', 'У меня забронирован номер.'], ['hotel', 'Во сколько завтрак?'], ['hotel', 'Какой пароль от Wi-Fi?'], ['hotel', 'Можно оставить здесь багаж?'], ['hotel', 'Во сколько нужно освободить номер?'], ['hotel', 'Вызовите мне такси, пожалуйста.'],
    ['food', 'Столик на двоих, пожалуйста.'], ['food', 'Меню, пожалуйста.'], ['food', 'Что вы посоветуете?'], ['food', 'Я не ем мясо.'], ['food', 'Счёт, пожалуйста.'], ['food', 'Можно оплатить картой?'],
    ['transport', 'Где автобусная остановка?'], ['transport', 'Как добраться до вокзала?'], ['transport', 'Один билет, пожалуйста.'], ['transport', 'Отвезите меня по этому адресу, пожалуйста.'], ['transport', 'Сколько стоит поездка?'], ['transport', 'Где ближайшая станция метро?'],
    ['sos', 'Помогите!'], ['sos', 'Вызовите скорую помощь!'], ['sos', 'Вызовите полицию!'], ['sos', 'Мне нужен врач.'], ['sos', 'Где ближайшая аптека?'], ['sos', 'Я потерял паспорт.'],
    ['shop', 'Можно посмотреть?'], ['shop', 'У вас есть другой размер?'], ['shop', 'Можно примерить?'], ['shop', 'Это слишком дорого.'], ['shop', 'Сделаете скидку?'], ['shop', 'Дайте чек, пожалуйста.'],
    ['city', 'Как добраться до центра города?'], ['city', 'Это далеко отсюда?'], ['city', 'Покажите на карте, пожалуйста.'], ['city', 'Где ближайший банкомат?'], ['city', 'Где можно купить SIM-карту?'], ['city', 'Во сколько открывается музей?'],
    ['social', 'Как вас зовут?'], ['social', 'Приятно познакомиться!'], ['social', 'Вы говорите по-английски?'], ['social', 'Сфотографируйте нас, пожалуйста.'], ['social', 'До свидания!'], ['social', 'Хорошего дня!']
  ];
  const PB = {
    en: 'Hello!|Thank you!|Excuse me.|Yes / No|I don’t understand.|Please speak more slowly.|How much is this?|Where is the toilet?|I have a reservation.|What time is breakfast?|What is the Wi-Fi password?|Can I leave my luggage here?|What time is check-out?|Could you call me a taxi, please?|A table for two, please.|The menu, please.|What do you recommend?|I don’t eat meat.|The bill, please.|Can I pay by card?|Where is the bus stop?|How do I get to the train station?|One ticket, please.|Please take me to this address.|How much is the fare?|Where is the nearest metro station?|Help!|Call an ambulance!|Call the police!|I need a doctor.|Where is the nearest pharmacy?|I have lost my passport.|Can I have a look?|Do you have another size?|Can I try it on?|That’s too expensive.|Can you give me a discount?|Can I have a receipt, please?|How do I get to the city centre?|Is it far from here?|Please show me on the map.|Where is the nearest ATM?|Where can I buy a SIM card?|What time does the museum open?|What is your name?|Nice to meet you!|Do you speak English?|Could you take a photo of us, please?|Goodbye!|Have a nice day!',
    de: 'Guten Tag!|Danke!|Entschuldigung.|Ja / Nein|Ich verstehe nicht.|Bitte sprechen Sie langsamer.|Wie viel kostet das?|Wo ist die Toilette?|Ich habe ein Zimmer reserviert.|Wann gibt es Frühstück?|Wie lautet das WLAN-Passwort?|Kann ich mein Gepäck hier lassen?|Bis wann muss ich das Zimmer räumen?|Können Sie mir bitte ein Taxi rufen?|Einen Tisch für zwei, bitte.|Die Speisekarte, bitte.|Was empfehlen Sie?|Ich esse kein Fleisch.|Die Rechnung, bitte.|Kann ich mit Karte zahlen?|Wo ist die Bushaltestelle?|Wie komme ich zum Bahnhof?|Eine Fahrkarte, bitte.|Bringen Sie mich bitte zu dieser Adresse.|Was kostet die Fahrt?|Wo ist die nächste U-Bahn-Station?|Hilfe!|Rufen Sie einen Krankenwagen!|Rufen Sie die Polizei!|Ich brauche einen Arzt.|Wo ist die nächste Apotheke?|Ich habe meinen Reisepass verloren.|Darf ich mal sehen?|Haben Sie eine andere Größe?|Kann ich das anprobieren?|Das ist zu teuer.|Können Sie mir einen Rabatt geben?|Eine Quittung, bitte.|Wie komme ich ins Stadtzentrum?|Ist das weit von hier?|Zeigen Sie es mir bitte auf der Karte.|Wo ist der nächste Geldautomat?|Wo kann ich eine SIM-Karte kaufen?|Wann öffnet das Museum?|Wie heißen Sie?|Freut mich, Sie kennenzulernen!|Sprechen Sie Englisch?|Könnten Sie bitte ein Foto von uns machen?|Auf Wiedersehen!|Einen schönen Tag noch!',
    fr: 'Bonjour !|Merci !|Excusez-moi.|Oui / Non|Je ne comprends pas.|Parlez plus lentement, s’il vous plaît.|Combien ça coûte ?|Où sont les toilettes ?|J’ai une réservation.|À quelle heure est le petit-déjeuner ?|Quel est le mot de passe du Wi-Fi ?|Puis-je laisser mes bagages ici ?|À quelle heure faut-il libérer la chambre ?|Pouvez-vous m’appeler un taxi, s’il vous plaît ?|Une table pour deux, s’il vous plaît.|La carte, s’il vous plaît.|Que me conseillez-vous ?|Je ne mange pas de viande.|L’addition, s’il vous plaît.|Puis-je payer par carte ?|Où est l’arrêt de bus ?|Comment aller à la gare ?|Un billet, s’il vous plaît.|Emmenez-moi à cette adresse, s’il vous plaît.|Combien coûte la course ?|Où est la station de métro la plus proche ?|Au secours !|Appelez une ambulance !|Appelez la police !|J’ai besoin d’un médecin.|Où est la pharmacie la plus proche ?|J’ai perdu mon passeport.|Je peux regarder ?|Vous avez une autre taille ?|Je peux l’essayer ?|C’est trop cher.|Vous pouvez me faire une réduction ?|Un reçu, s’il vous plaît.|Comment aller au centre-ville ?|C’est loin d’ici ?|Montrez-moi sur la carte, s’il vous plaît.|Où est le distributeur le plus proche ?|Où puis-je acheter une carte SIM ?|À quelle heure ouvre le musée ?|Comment vous appelez-vous ?|Enchanté !|Vous parlez anglais ?|Vous pouvez nous prendre en photo, s’il vous plaît ?|Au revoir !|Bonne journée !',
    es: '¡Hola!|¡Gracias!|Perdón.|Sí / No|No entiendo.|Hable más despacio, por favor.|¿Cuánto cuesta?|¿Dónde está el baño?|Tengo una reserva.|¿A qué hora es el desayuno?|¿Cuál es la contraseña del wifi?|¿Puedo dejar mi equipaje aquí?|¿A qué hora hay que dejar la habitación?|¿Me puede llamar un taxi, por favor?|Una mesa para dos, por favor.|La carta, por favor.|¿Qué me recomienda?|No como carne.|La cuenta, por favor.|¿Puedo pagar con tarjeta?|¿Dónde está la parada de autobús?|¿Cómo llego a la estación de tren?|Un billete, por favor.|Lléveme a esta dirección, por favor.|¿Cuánto cuesta el viaje?|¿Dónde está la estación de metro más cercana?|¡Ayuda!|¡Llame a una ambulancia!|¡Llame a la policía!|Necesito un médico.|¿Dónde está la farmacia más cercana?|He perdido mi pasaporte.|¿Puedo mirarlo?|¿Tiene otra talla?|¿Puedo probármelo?|Es demasiado caro.|¿Me hace un descuento?|El recibo, por favor.|¿Cómo llego al centro de la ciudad?|¿Está lejos de aquí?|Muéstremelo en el mapa, por favor.|¿Dónde está el cajero más cercano?|¿Dónde puedo comprar una tarjeta SIM?|¿A qué hora abre el museo?|¿Cómo se llama?|¡Encantado de conocerle!|¿Habla inglés?|¿Nos puede hacer una foto, por favor?|¡Adiós!|¡Que tenga un buen día!',
    it: 'Buongiorno!|Grazie!|Mi scusi.|Sì / No|Non capisco.|Parli più lentamente, per favore.|Quanto costa?|Dov’è il bagno?|Ho una prenotazione.|A che ora è la colazione?|Qual è la password del Wi-Fi?|Posso lasciare qui i bagagli?|A che ora devo lasciare la camera?|Mi può chiamare un taxi, per favore?|Un tavolo per due, per favore.|Il menù, per favore.|Cosa mi consiglia?|Non mangio carne.|Il conto, per favore.|Posso pagare con la carta?|Dov’è la fermata dell’autobus?|Come arrivo alla stazione?|Un biglietto, per favore.|Mi porti a questo indirizzo, per favore.|Quanto costa la corsa?|Dov’è la stazione della metro più vicina?|Aiuto!|Chiamate un’ambulanza!|Chiamate la polizia!|Ho bisogno di un medico.|Dov’è la farmacia più vicina?|Ho perso il passaporto.|Posso dare un’occhiata?|Avete un’altra taglia?|Posso provarlo?|È troppo caro.|Mi fa uno sconto?|Lo scontrino, per favore.|Come arrivo al centro città?|È lontano da qui?|Me lo mostri sulla mappa, per favore.|Dov’è il bancomat più vicino?|Dove posso comprare una SIM?|A che ora apre il museo?|Come si chiama?|Piacere di conoscerla!|Parla inglese?|Ci può fare una foto, per favore?|Arrivederci!|Buona giornata!',
    pt: 'Olá!|Obrigado!|Desculpe.|Sim / Não|Não entendo.|Fale mais devagar, por favor.|Quanto custa?|Onde é a casa de banho?|Tenho uma reserva.|A que horas é o pequeno-almoço?|Qual é a palavra-passe do Wi-Fi?|Posso deixar a bagagem aqui?|A que horas tenho de deixar o quarto?|Pode chamar-me um táxi, por favor?|Uma mesa para dois, por favor.|A ementa, por favor.|O que me recomenda?|Não como carne.|A conta, por favor.|Posso pagar com cartão?|Onde é a paragem do autocarro?|Como chego à estação de comboios?|Um bilhete, por favor.|Leve-me a esta morada, por favor.|Quanto custa a viagem?|Onde é a estação de metro mais próxima?|Socorro!|Chamem uma ambulância!|Chamem a polícia!|Preciso de um médico.|Onde é a farmácia mais próxima?|Perdi o meu passaporte.|Posso ver?|Tem outro tamanho?|Posso experimentar?|É muito caro.|Pode fazer-me um desconto?|O recibo, por favor.|Como chego ao centro da cidade?|É longe daqui?|Mostre-me no mapa, por favor.|Onde fica o multibanco mais próximo?|Onde posso comprar um cartão SIM?|A que horas abre o museu?|Como se chama?|Muito prazer!|Fala inglês?|Pode tirar-nos uma fotografia, por favor?|Adeus!|Tenha um bom dia!',
    tr: 'Merhaba!|Teşekkür ederim!|Affedersiniz.|Evet / Hayır|Anlamıyorum.|Lütfen daha yavaş konuşun.|Bu ne kadar?|Tuvalet nerede?|Rezervasyonum var.|Kahvaltı saat kaçta?|Wi-Fi şifresi nedir?|Bavulumu burada bırakabilir miyim?|Odadan saat kaçta çıkmam gerekiyor?|Bana bir taksi çağırır mısınız lütfen?|İki kişilik bir masa, lütfen.|Menü, lütfen.|Ne tavsiye edersiniz?|Et yemiyorum.|Hesap, lütfen.|Kartla ödeyebilir miyim?|Otobüs durağı nerede?|Tren istasyonuna nasıl giderim?|Bir bilet, lütfen.|Lütfen beni bu adrese götürün.|Yolculuk ne kadar tutar?|En yakın metro istasyonu nerede?|İmdat!|Ambulans çağırın!|Polis çağırın!|Doktora ihtiyacım var.|En yakın eczane nerede?|Pasaportumu kaybettim.|Bakabilir miyim?|Başka bedeni var mı?|Deneyebilir miyim?|Bu çok pahalı.|İndirim yapar mısınız?|Fiş alabilir miyim?|Şehir merkezine nasıl giderim?|Buradan uzak mı?|Lütfen haritada gösterin.|En yakın ATM nerede?|Nereden SIM kart alabilirim?|Müze saat kaçta açılıyor?|Adınız ne?|Tanıştığımıza memnun oldum!|İngilizce biliyor musunuz?|Fotoğrafımızı çekebilir misiniz, lütfen?|Hoşça kalın!|İyi günler!'
  };
  const savedPh = c => { const a = LS.get('pb_' + c, null); return Array.isArray(a) && a.length >= PH.length ? a : null; };
  const phrases = c => c === 'ru' ? PH.map(p => p[1]) : PB[c] ? PB[c].split('|') : savedPh(c);
  const phraseState = c => (c === 'ru' || PB[c]) ? 'builtin' : (savedPh(c) ? 'saved' : 'need');

  // ---------- Перевод ----------
  const norm = s => String(s || '').toLowerCase().replace(/[!?.¡¿,;:'"’«»…\s]+/g, ' ').trim();
  function fromPhrasebook(text, from, to) {
    const src = phrases(from), dst = phrases(to);
    if (!src || !dst) return null;
    const i = src.findIndex(s => norm(s) === norm(text));
    return i >= 0 && dst[i] ? dst[i] : null;
  }
  const memo = (() => { let m = null; const load = () => m || (m = LS.get('memo', {})); return {
    get: k => load()[k], set(k, v) { load(); m[k] = v; const keys = Object.keys(m); if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(x => delete m[x]); LS.set('memo', m); } }; })();

  const hasDevice = () => typeof self !== 'undefined' && 'Translator' in self;
  const availMemo = {};
  async function deviceAvail(from, to) {
    if (!hasDevice()) return 'unsupported';
    const k = from + '>' + to, m = availMemo[k];
    if (m && (m.v === 'available' || Date.now() - m.t < 30000)) return m.v;
    let v;
    try { v = await Promise.race([self.Translator.availability({ sourceLanguage: from, targetLanguage: to }), pause(2500).then(() => 'unsupported')]); } catch (_) { v = 'unsupported'; }
    availMemo[k] = { v, t: Date.now() };
    return v;
  }
  const devT = {};
  function deviceTranslator(from, to, onProgress) {
    const k = from + '>' + to;
    if (!devT[k]) devT[k] = self.Translator.create({ sourceLanguage: from, targetLanguage: to,
      monitor(m) { m.addEventListener('downloadprogress', e => { if (onProgress) onProgress(e.loaded); }); } })
      .catch(e => { delete devT[k]; throw e; });
    return devT[k];
  }
  const decode = s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
  const MM = c => (c === 'zh' ? 'zh-CN' : c);
  async function myMemory(text, from, to) {
    const parts = []; let cur = '';
    (text.match(/[^.!?。！？\n]+[.!?。！？\n]*/g) || [text]).forEach(s => { if ((cur + s).length > 450 && cur) { parts.push(cur); cur = ''; } cur += s; });
    if (cur) parts.push(cur);
    const out = [];
    for (const p of parts.slice(0, 8)) {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 12000);
      try {
        const r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(p.trim()) + '&langpair=' + MM(from) + '|' + MM(to), { signal: ctl.signal });
        const j = await r.json();
        if (+j.responseStatus !== 200 || !j.responseData) throw new Error(+j.responseStatus === 429 ? 'quota' : 'service');
        out.push(decode(j.responseData.translatedText || ''));
      } finally { clearTimeout(tm); }
    }
    return out.join(' ').trim();
  }
  // → { text, engine: 'phrasebook' | 'memo' | 'device' | 'online' }
  async function translate(text, from, to) {
    text = String(text || '').trim();
    if (!text) return null;
    if (from === to) return { text, engine: 'same' };
    const pb = fromPhrasebook(text, from, to);
    if (pb) return { text: pb, engine: 'phrasebook' };
    const key = from + '|' + to + '|' + text;
    if ((await deviceAvail(from, to)) === 'available') {
      try { const t = await deviceTranslator(from, to); const r = await t.translate(text); if (r) { memo.set(key, r); return { text: r, engine: 'device' }; } } catch (_) {}
    }
    const m = memo.get(key);
    if (m) return { text: m, engine: 'memo' };
    if (!online()) throw new Error('offline');
    const r = await myMemory(text, from, to);
    if (!r) throw new Error('service');
    memo.set(key, r);
    return { text: r, engine: 'online' };
  }
  const errText = e => (e && e.message) === 'offline' ? 'Нет интернета. Без сети работают разговорник, история и языки, скачанные на устройство.'
    : (e && e.message) === 'quota' ? 'Дневной лимит бесплатного онлайн-перевода исчерпан. Попробуйте завтра или скачайте язык на устройство.'
      : 'Не удалось перевести — проверьте интернет и попробуйте ещё раз.';
  const ENGINE = { device: 'на устройстве', online: 'онлайн · MyMemory', memo: 'из сохранённых', phrasebook: 'из разговорника', same: '' };

  // Определение языка: по алфавиту, затем встроенный детектор Chrome (если есть)
  let detP = null;
  async function detect(text) {
    const t = String(text || '').trim();
    if (/[Ѐ-ӿ]/.test(t)) return /[іїєґ]/i.test(t) ? 'uk' : 'ru';
    if (/[Ͱ-Ͽ]/.test(t)) return 'el';
    if (/[぀-ヿ]/.test(t)) return 'ja';
    if (/[一-鿿]/.test(t)) return 'zh';
    if (/[؀-ۿ]/.test(t)) return 'ar';
    if (/[Ⴀ-ჿ]/.test(t)) return 'ka';
    if (/[԰-֏]/.test(t)) return 'hy';
    if ('LanguageDetector' in self && t.length > 3) {
      try {
        if (!detP) detP = self.LanguageDetector.availability().then(a => a === 'available' ? self.LanguageDetector.create() : null);
        const d = await detP;
        if (d) { const r = await d.detect(t); const top = r && r[0]; if (top && top.confidence > 0.6 && L[top.detectedLanguage]) return top.detectedLanguage; }
      } catch (_) { detP = null; }
    }
    return null;
  }

  // ---------- Голос ----------
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  function voiceFor(c) {
    if (!('speechSynthesis' in window) || !L[c]) return null;
    const vs = speechSynthesis.getVoices();
    return vs.find(v => v.lang === L[c].v) || vs.find(v => (v.lang || '').toLowerCase().startsWith(c)) || null;
  }
  if ('speechSynthesis' in window) { try { speechSynthesis.getVoices(); } catch (_) {} } // браузер подгружает список голосов заранее
  function speak(text, c) {
    if (!('speechSynthesis' in window)) return false;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = L[c] ? L[c].v : c; u.rate = 0.92;
      const v = voiceFor(c); if (v) u.voice = v;
      speechSynthesis.speak(u); return true;
    } catch (_) { return false; }
  }
  // Слушать речь: onText(промежуточный текст), → Promise<итоговый текст>
  function listen(c, onText) {
    return new Promise((resolve, reject) => {
      if (!Rec) { reject(new Error('nospeech')); return; }
      const r = new Rec(); r.lang = L[c] ? L[c].v : c; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
      let fin = '', last = '';
      r.onresult = e => { let s = ''; for (let i = 0; i < e.results.length; i++) { s += e.results[i][0].transcript; if (e.results[i].isFinal) fin = s; } last = s; if (onText) onText(s); };
      r.onerror = e => { r._err = e.error; };
      r.onend = () => { const t = (fin || last).trim(); if (t) resolve(t); else reject(new Error(r._err || 'nothing')); };
      try { r.start(); } catch (e) { reject(e); }
      listen.stop = () => { try { r.stop(); } catch (_) {} };
    });
  }
  const micErr = e => { const m = e && (e.message || e.error); return m === 'nospeech' ? 'Голосовой ввод не поддерживается этим браузером — откройте приложение в Chrome или введите текст.'
    : m === 'not-allowed' || m === 'service-not-allowed' ? 'Нет доступа к микрофону — разрешите его в настройках браузера.'
      : m === 'network' ? 'Для распознавания речи нужен интернет.' : 'Не расслышал — попробуйте ещё раз.'; };

  // ---------- Избранное и история (на устройстве) ----------
  const favs = () => LS.get('fav', []);
  const hist = () => LS.get('hist', []);
  const keyOf = x => x.from + '|' + x.to + '|' + x.src;
  const isFav = x => favs().some(f => keyOf(f) === keyOf(x));
  function toggleFav(x) {
    const list = favs(), k = keyOf(x), i = list.findIndex(f => keyOf(f) === k);
    if (i >= 0) list.splice(i, 1); else list.unshift({ from: x.from, to: x.to, src: x.src, tr: x.tr, t: Date.now() });
    LS.set('fav', list.slice(0, 200)); return i < 0;
  }
  function addHist(x) {
    // пока человек печатает, не копим «Hal», «Hall», «Hallo» — оставляем только последний вариант
    const list = hist().filter(h => keyOf(h) !== keyOf(x) && !(h.from === x.from && h.to === x.to && Date.now() - h.t < 60000 && (x.src.startsWith(h.src) || h.src.startsWith(x.src))));
    list.unshift({ from: x.from, to: x.to, src: x.src, tr: x.tr, t: Date.now() });
    LS.set('hist', list.slice(0, 60));
  }

  // ---------- Страна и язык поездки ----------
  const lsJSON = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
  const placeKey = trip => [trip.dest || '', trip.name || ''].join('|').toLowerCase();
  function tripCC(trip) {
    if (!trip) return null;
    const pk = placeKey(trip);
    const own = lsJSON('st_mod_translator_' + trip.id + '_ccTrip'); if (own && own.q === pk) return own.cc;
    const em = lsJSON('st_mod_emergency_' + trip.id + '_ccTrip'); if (em && em.q === pk) return em.cc;
    return null;
  }
  const detecting = {};
  function detectTripCC(trip) {
    if (!trip || tripCC(trip) || !online()) return Promise.resolve(tripCC(trip));
    if (!detecting[trip.id]) detecting[trip.id] = (async () => {
      for (const q of [trip.dest || trip.name].filter(Boolean)) {
        try {
          const ctl = new AbortController(); setTimeout(() => ctl.abort(), 9000);
          const j = await (await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&accept-language=ru&q=' + encodeURIComponent(q), { signal: ctl.signal })).json();
          const cc = j[0] && j[0].address && j[0].address.country_code;
          if (cc) { const C = cc.toUpperCase(); try { localStorage.setItem('st_mod_translator_' + trip.id + '_ccTrip', JSON.stringify({ q: placeKey(trip), cc: C })); } catch (_) {} return C; }
        } catch (_) {}
      }
      delete detecting[trip.id]; return null;
    })();
    return detecting[trip.id];
  }
  const myLang = () => { const a = String(document.documentElement.lang || 'ru').slice(0, 2); return L[a] ? a : 'ru'; };
  function tripLang(trip) {
    const cc = tripCC(trip);
    return cc ? (CC_LANG[String(cc).toUpperCase()] || null) : null;
  }

  // ---------- Распознавание текста с фото (Tesseract, файлы в приложении) ----------
  let tessP = null;
  const loadTess = () => window.Tesseract ? Promise.resolve(window.Tesseract) : (tessP = tessP || new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = OCR + 'tesseract.min.js';
    s.onload = () => window.Tesseract ? ok(window.Tesseract) : no(new Error('ocr')); s.onerror = () => { tessP = null; no(new Error('ocr')); };
    document.head.appendChild(s);
  }));
  async function readPhoto(file, c, onProgress) {
    const T = await loadTess();
    const worker = await T.createWorker(L[c].o, 1, { workerPath: OCR + 'worker.min.js', corePath: OCR, langPath: OCR + 'lang', gzip: true, workerBlobURL: false,
      logger: m => { if (onProgress && m && typeof m.progress === 'number') onProgress(m.status, m.progress); } });
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
      const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      const { data } = await worker.recognize(cv);
      return (data.text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    } finally { try { await worker.terminate(); } catch (_) {} }
  }

  // ---------- Скачать язык для офлайна ----------
  const OFF_CACHE = 'st-offline-assets';
  async function cacheUrls(urls) {
    if (!('caches' in window)) return;
    const c = await caches.open(OFF_CACHE);
    for (const u of urls) { try { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) await c.put(u, r.clone()); } catch (_) {} }
  }
  async function ocrCached(c) {
    if (!L[c] || !L[c].o || !('caches' in window)) return false;
    try { return !!(await caches.match(OCR + 'lang/' + L[c].o + '.traineddata.gz')); } catch (_) { return false; }
  }
  async function langStatus(c, my) {
    my = my || myLang();
    const [d1, d2, ocr] = await Promise.all([deviceAvail(c, my), deviceAvail(my, c), ocrCached(c)]);
    const order = ['unsupported', 'unavailable', 'downloadable', 'downloading', 'available'];
    const device = order[Math.min(order.indexOf(d1), order.indexOf(d2))] || 'unsupported';
    return { phrases: phraseState(c), device, ocr: L[c] && L[c].o ? (ocr ? 'saved' : 'need') : 'none', voice: !!voiceFor(c) };
  }
  // onStep(текст) — для показа прогресса
  async function downloadLang(c, my, onStep) {
    my = my || myLang();
    const say = t => { if (onStep) onStep(t); };
    const res = { device: null, phrases: null, ocr: null };
    // 1) модель Chrome на устройстве — запускаем сразу, пока действует нажатие пользователя
    if (hasDevice()) {
      for (const [a, b] of [[c, my], [my, c]]) {
        const av = await deviceAvail(a, b);
        if (av === 'downloadable' || av === 'downloading') {
          try { say('Языковая модель ' + nm(c) + '…'); await deviceTranslator(a, b, p => say('Языковая модель ' + nm(c) + ': ' + Math.round(p * 100) + '%')); availMemo[a + '>' + b] = { v: 'available', t: Date.now() }; res.device = 'ok'; } catch (_) { res.device = 'fail'; }
        } else if (av === 'available') res.device = 'ok';
      }
    }
    // 2) разговорник
    if (phraseState(c) === 'need') {
      if (!online()) res.phrases = 'offline';
      else {
        try {
          const out = [], prev = LS.get('pb_' + c, null) || [];
          for (let i = 0; i < PH.length; i++) {
            if (prev[i]) { out.push(prev[i]); continue; }
            say('Фразы: ' + (i + 1) + ' из ' + PH.length);
            const r = await translate(PH[i][1], 'ru', c); out.push(r ? r.text : '');
            if (r && r.engine === 'online') await pause(250);
          }
          LS.set('pb_' + c, out); res.phrases = 'ok';
        } catch (e) { res.phrases = 'fail'; }
      }
    }
    // 3) распознавание текста с фото
    if (L[c] && L[c].o) { say('Текст с фото: ' + nm(c) + '…'); await cacheUrls([OCR + 'lang/' + L[c].o + '.traineddata.gz', OCR + 'tesseract.min.js', OCR + 'worker.min.js', OCR + coreFile()]); res.ocr = (await ocrCached(c)) ? 'ok' : 'fail'; }
    return res;
  }
  // какой файл ядра Tesseract выберет этот браузер (та же проверка, что в worker.min.js)
  function coreFile() {
    const ok = b => { try { return WebAssembly.validate(new Uint8Array(b)); } catch (_) { return false; } };
    const simd = ok([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
    const relaxed = ok([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11]);
    return relaxed ? 'tesseract-core-relaxedsimd-lstm.wasm.js' : simd ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js';
  }

  // ---------- Стили ----------
  STHub.addStyles(ID, `
    [data-module="tl-home"] .hub-title-row h2{font-size:1.12rem}
    .tl-trip-ph img{display:block;width:100%;height:100%;object-fit:cover}
    .tl-create-trip{display:flex;align-items:center;gap:14px;width:100%;min-height:100px;padding:18px 20px;border:1px solid var(--hub-card-b);border-radius:24px;background:var(--hub-card);box-shadow:var(--hub-shadow);color:var(--text);font:inherit;text-align:left;cursor:pointer}
    .tl-create-trip>svg{width:28px;height:28px;color:var(--accent);flex-shrink:0}
    .tl-create-trip span{display:flex;flex-direction:column;gap:4px;flex:1}
    .tl-create-trip b{font-size:1.05rem}
    .tl-create-trip small{font-size:.78rem;color:var(--t2)}
    .tl-create-trip>svg:last-child{width:20px;height:20px;color:var(--t2)}
    .tl-main{position:relative;margin-top:14px;padding:14px;border-radius:28px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:0 14px 36px rgba(70,60,160,.12)}
    .tl-pair{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center}
    .tl-lang{display:flex;align-items:center;justify-content:center;gap:10px;height:56px;border-radius:22px;border:0;background:rgba(106,77,244,.07);font:inherit;font-size:1.2rem;font-weight:800;color:var(--text);cursor:pointer}
    .tl-select-lang{font-size:.85rem;font-weight:600;color:var(--t2)}
    .tl-flag{width:34px;height:34px;border-radius:50%;object-fit:cover;box-shadow:0 1px 4px rgba(0,0,0,.18);flex-shrink:0}
    .tl-swap{width:48px;height:48px;border-radius:50%;border:0;background:rgba(106,77,244,.08);color:#5b4bd6;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .tl-swap svg{width:24px;height:24px;stroke-width:2.4}
    .tl-swap:disabled{opacity:.45;cursor:default}
    .tl-input{display:flex;align-items:flex-end;gap:8px;margin-top:12px;padding:10px 10px 10px 16px;border-radius:20px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:inset 0 1px 3px rgba(40,30,120,.05),0 4px 14px rgba(70,60,160,.06)}
    .tl-input textarea{flex:1;min-width:0;min-height:44px;max-height:180px;resize:none;border:0;outline:0;background:none;font:inherit;font-size:1.05rem;line-height:1.4;color:var(--text);padding:10px 0}
    .tl-input textarea::placeholder{color:var(--t2)}
    .tl-mic{width:46px;height:46px;border-radius:50%;border:0;background:rgba(106,77,244,.1);color:#5b4bd6;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
    .tl-mic svg{width:24px;height:24px;stroke-width:2.2}
    .tl-mic.on{background:#e5262c;color:#fff;animation:tlPulse 1.2s infinite}
    @keyframes tlPulse{0%{box-shadow:0 0 0 0 rgba(229,38,44,.45)}100%{box-shadow:0 0 0 14px rgba(229,38,44,0)}}
    .tl-res{margin-top:12px;padding:14px 16px;border-radius:20px;background:rgba(106,77,244,.06)}
    .tl-res-h{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:.8rem;color:var(--t2);font-weight:600}
    .tl-res-h .tl-flag{width:20px;height:20px}
    .tl-res-h .l{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
    .tl-res-h em{margin-left:auto;font-style:normal;font-weight:600;white-space:nowrap}
    .tl-res-t{margin-top:8px;font-size:1.3rem;font-weight:700;line-height:1.35;color:var(--text);overflow-wrap:anywhere;white-space:pre-wrap}
    .tl-res-acts{display:flex;gap:8px;margin-top:12px}
    .tl-act{width:42px;height:42px;border-radius:50%;border:1px solid var(--hub-card-b);background:var(--hub-card);color:#5b4bd6;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .tl-act svg{width:20px;height:20px}
    .tl-act.fav svg{fill:#f5a623;stroke:#f5a623}
    .tl-note{margin-top:10px;font-size:.84rem;color:var(--t2);line-height:1.4}
    .tl-err{margin-top:12px;padding:12px 14px;border-radius:16px;background:rgba(229,38,44,.08);color:var(--text);font-size:.9rem;line-height:1.4}
    .tl-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
    .tl-tile{display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 10px 18px;border-radius:26px;border:1px solid var(--hub-card-b);background:var(--hub-card);box-shadow:var(--hub-shadow);font:inherit;color:var(--text);cursor:pointer;text-align:center}
    .tl-ic{width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 35% 30%,#f6f4ff 0%,#e4e0fc 70%);color:#5b4bd6;box-shadow:inset 0 -3px 6px rgba(91,75,214,.12),0 6px 14px rgba(91,75,214,.14);flex-shrink:0}
    [data-theme=dark] .tl-ic{background:radial-gradient(circle at 35% 30%,#3a3470 0%,#2a2556 70%);color:#b9b0ff}
    .tl-ic svg{width:30px;height:30px;stroke-width:2.2}
    .tl-ic.star{color:#f5a623}
    .tl-ic.star svg{fill:#ffc94d;stroke:#f5a623}
    .tl-tile b{font-size:1.15rem;font-weight:800}
    .tl-tile small{font-size:.86rem;color:var(--t2);line-height:1.3}
    .tl-dl{display:flex;align-items:center;gap:14px;width:100%;margin-top:14px;padding:12px 16px;border-radius:24px;border:1px solid var(--hub-card-b);background:var(--hub-card);box-shadow:var(--hub-shadow);font:inherit;color:var(--text);cursor:pointer;text-align:left}
    .tl-dl .tl-ic{width:48px;height:48px}
    .tl-dl .tl-ic svg{width:24px;height:24px}
    .tl-dl b{flex:1;font-size:1rem;font-weight:800}
    .tl-dl>svg{width:22px;height:22px}
    .tl-card{padding:14px 16px;border-radius:22px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .tl-chips{display:flex;gap:8px;overflow-x:auto;padding:2px 0 6px;scrollbar-width:none}
    .tl-chips::-webkit-scrollbar{display:none}
    .tl-chip{display:flex;align-items:center;gap:6px;flex-shrink:0;padding:9px 14px;border-radius:999px;border:1px solid var(--hub-card-b);background:var(--hub-card);font:inherit;font-size:.9rem;font-weight:700;color:var(--text);cursor:pointer;white-space:nowrap}
    .tl-chip svg{width:16px;height:16px}
    .tl-chip.on{background:linear-gradient(135deg,#5b4bd6,#7b6bf0);color:#fff;border-color:transparent;box-shadow:0 6px 14px rgba(91,75,214,.28)}
    .tl-chip .tl-flag{width:20px;height:20px}
    /* Категории фраз: 4 одинаковые плитки в ряд, иконка сверху, подпись до 2 строк (длинные слова на el/pl/pt не вылезают) */
    .tl-cats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:1fr;gap:6px;overflow:visible;padding:2px 0 6px}
    .tl-cats .tl-chip{flex-direction:column;justify-content:center;gap:5px;min-width:0;min-height:68px;padding:8px 3px;border-radius:16px;font-size:.74rem;line-height:1.15;letter-spacing:-.01em;text-align:center;white-space:normal}
    .tl-cats .tl-chip svg{width:18px;height:18px;flex-shrink:0}
    .tl-cats .tl-chip span{display:block;max-width:100%;overflow-wrap:anywhere;hyphens:auto}
    @media (max-width:350px){.tl-cats{gap:5px}.tl-cats .tl-chip{font-size:.66rem;padding:8px 2px;letter-spacing:-.02em}}
    .tl-ph{display:flex;align-items:center;gap:10px;padding:13px 14px;border-radius:20px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow);cursor:pointer}
    .tl-ph>span{flex:1;min-width:0}
    .tl-ph b{display:block;font-size:1.05rem;font-weight:700;line-height:1.3;overflow-wrap:anywhere}
    .tl-ph small{display:block;font-size:.84rem;color:var(--t2);margin-top:3px;line-height:1.3}
    .tl-list{display:flex;flex-direction:column;gap:10px}
    .tl-tabs{display:grid;grid-template-columns:1fr 1fr;padding:4px;border-radius:999px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .tl-tabs button{border:0;background:none;font:inherit;font-weight:700;font-size:.95rem;color:var(--text);padding:11px 4px;border-radius:999px;cursor:pointer}
    .tl-tabs button.on{background:linear-gradient(135deg,#5b4bd6,#7b6bf0);color:#fff}
    .tl-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:15px 16px;border-radius:999px;border:0;background:linear-gradient(135deg,#5b4bd6,#7b6bf0);color:#fff;font:inherit;font-size:1rem;font-weight:800;cursor:pointer;box-shadow:0 10px 22px rgba(91,75,214,.3)}
    .tl-btn.lite{background:rgba(106,77,244,.1);color:#5b4bd6;box-shadow:none}
    .tl-btn svg{width:22px;height:22px}
    .tl-btn[disabled]{opacity:.6}
    .tl-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .tl-chat{display:flex;flex-direction:column;gap:10px;min-height:180px}
    .tl-bub{max-width:86%;padding:12px 14px;border-radius:20px;cursor:pointer}
    .tl-bub.me{align-self:flex-end;background:linear-gradient(135deg,#5b4bd6,#7b6bf0);color:#fff;border-bottom-right-radius:6px}
    .tl-bub.them{align-self:flex-start;background:var(--hub-card);border:1px solid var(--hub-card-b);color:var(--text);border-bottom-left-radius:6px}
    .tl-bub b{display:block;font-size:1.08rem;font-weight:700;line-height:1.35;overflow-wrap:anywhere}
    .tl-bub small{display:block;font-size:.82rem;opacity:.78;margin-top:4px;line-height:1.3;overflow-wrap:anywhere}
    .tl-bub.live{opacity:.7;font-style:italic}
    .tl-talk{position:sticky;bottom:0;padding:12px 0 calc(8px + env(safe-area-inset-bottom,0px));background:linear-gradient(180deg,rgba(0,0,0,0),var(--bg) 30%)}
    .tl-talk .tl-btn{flex-direction:column;gap:4px;padding:14px 8px;border-radius:24px;font-size:.92rem}
    .tl-talk .tl-btn .tl-flag{width:26px;height:26px}
    .tl-talk .tl-btn.on{background:#e5262c;color:#fff;animation:tlPulse 1.2s infinite}
    .tl-sw{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:.9rem;color:var(--t2);margin-top:10px}
    .tl-sw input{width:22px;height:22px;accent-color:#5b4bd6}
    .tl-photo{width:100%;max-height:260px;object-fit:contain;border-radius:16px;background:rgba(0,0,0,.04)}
    .tl-ta{width:100%;min-height:110px;resize:vertical;border-radius:16px;border:1px solid var(--hub-card-b);background:var(--hub-card);color:var(--text);font:inherit;font-size:1rem;line-height:1.4;padding:12px;box-sizing:border-box}
    .tl-prog{height:6px;border-radius:6px;background:rgba(106,77,244,.12);overflow:hidden;margin-top:10px}
    .tl-prog i{display:block;height:100%;background:linear-gradient(90deg,#5b4bd6,#7b6bf0);width:0;transition:width .2s}
    .tl-pk{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:22px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .tl-pk-h{display:flex;align-items:center;gap:12px}
    .tl-pk-h b{flex:1;font-size:1.02rem;font-weight:800}
    .tl-pk-h button{flex-shrink:0;padding:9px 14px;border-radius:999px;border:0;background:linear-gradient(135deg,#5b4bd6,#7b6bf0);color:#fff;font:inherit;font-size:.85rem;font-weight:800;cursor:pointer}
    .tl-pk-h button[disabled]{opacity:.55}
    .tl-st{display:flex;flex-wrap:wrap;gap:6px}
    .tl-st span{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;font-size:.78rem;font-weight:700}
    .tl-st span svg{width:14px;height:14px}
    .tl-st .ok{background:rgba(31,157,85,.12);color:#1b8a4b}
    .tl-st .need{background:rgba(106,77,244,.1);color:#5b4bd6}
    .tl-st .no{background:rgba(120,120,140,.12);color:var(--t2)}
    .tl-sec{margin:18px 4px 8px;font-size:.82rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--t2)}
    .tl-big{position:fixed;inset:0;z-index:2000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:30px 24px;background:var(--bg);color:var(--text);text-align:center}
    .tl-big .t{font-size:clamp(1.8rem,8vw,3.2rem);font-weight:800;line-height:1.25;overflow-wrap:anywhere;max-height:60vh;overflow:auto}
    .tl-big .s{font-size:1rem;color:var(--t2);max-width:520px}
    .tl-big .x{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));right:14px}
    .tl-big .h{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--t2)}
    .tl-sheet{position:fixed;inset:0;z-index:1900;background:rgba(10,10,30,.45);display:flex;align-items:flex-end;justify-content:center}
    .tl-sheet>div{width:100%;max-width:560px;max-height:82vh;overflow:auto;background:var(--bg);border-radius:26px 26px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px))}
    .tl-sheet h3{margin:0 0 12px;font-size:1.15rem;font-weight:800;text-align:center}
    .tl-opt{display:flex;align-items:center;gap:12px;width:100%;padding:11px 12px;border:0;border-radius:16px;background:none;font:inherit;font-size:1rem;font-weight:600;color:var(--text);cursor:pointer;text-align:left}
    .tl-lang-search{position:sticky;top:-18px;z-index:1;width:100%;margin:0 0 8px;padding:12px 14px;border:1px solid var(--hub-card-b);border-radius:14px;background:var(--hub-card);font:inherit;color:var(--text)}
    .tl-opt.on{background:rgba(106,77,244,.1)}
    .tl-opt>span:not(.tl-oc){flex:1}
    .tl-oc{font-size:.8rem;color:var(--t2);font-weight:700}
  `);

  const LOGO = `<svg viewBox="0 0 96 80" width="96" height="80" aria-hidden="true">
    <defs><linearGradient id="tlg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7d6cf4"/><stop offset="1" stop-color="#4a3bc9"/></linearGradient>
    <filter id="tls" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#4a3bc9" flood-opacity=".28"/></filter></defs>
    <rect x="4" y="4" width="46" height="46" rx="13" fill="#fff" filter="url(#tls)"/>
    <text x="27" y="40" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="31" fill="#4a3bc9">A</text>
    <rect x="42" y="28" width="46" height="46" rx="13" fill="url(#tlg)" filter="url(#tls)"/>
    <text x="65" y="62" text-anchor="middle" font-family="'Noto Sans SC','Microsoft YaHei','PingFang SC',sans-serif" font-weight="700" font-size="27" fill="#fff">文</text>
    <path d="M58 12a14 14 0 0 1 16 12" fill="none" stroke="#5b4bd6" stroke-width="4" stroke-linecap="round"/><path d="M70 22l4 3 3-5" fill="none" stroke="#5b4bd6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M30 66a14 14 0 0 1-16-12" fill="none" stroke="#5b4bd6" stroke-width="4" stroke-linecap="round"/><path d="M18 56l-4-3-3 5" fill="none" stroke="#5b4bd6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  // ---------- Общие элементы ----------
  function sheet(title, html, bind) {
    const el = document.createElement('div'); el.className = 'tl-sheet';
    el.innerHTML = `<div><h3>${esc(title)}</h3>${html}</div>`;
    const close = () => el.remove();
    el.addEventListener('click', e => { if (e.target === el) close(); });
    document.body.appendChild(el); icons(el);
    if (bind) bind(el.firstChild, close);
    return close;
  }
  function pickLang(title, cur, onPick, filter) {
    const list = CODES.filter(c => !filter || filter(c));
    sheet(title, `<input class="tl-lang-search" type="search" placeholder="Найти язык" aria-label="Найти язык">` + list.map(c => `<button class="tl-opt${c === cur ? ' on' : ''}" type="button" data-c="${c}">${flag(c)}<span>${esc(nm(c))}</span><span class="tl-oc">${c.toUpperCase()}</span></button>`).join(''),
      (root, close) => {
        root.querySelector('.tl-lang-search').addEventListener('input', e => {
          const q = e.target.value.trim().toLocaleLowerCase();
          root.querySelectorAll('[data-c]').forEach(b => { b.style.display = !q || nm(b.dataset.c).toLocaleLowerCase().includes(q) || b.dataset.c.includes(q) ? '' : 'none'; });
        });
        root.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { close(); onPick(b.dataset.c); }));
      });
  }
  function bigView(text, c, sub) {
    const el = document.createElement('div'); el.className = 'tl-big';
    el.innerHTML = `<button class="hub-icbtn x" type="button" aria-label="Закрыть"><i data-lucide="x"></i></button>
      <div class="h">${flag(c)}${esc(nm(c))}</div><div class="t" translate="no">${esc(text)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}
      <button class="tl-btn" type="button" style="max-width:320px"><i data-lucide="volume-2"></i>Озвучить</button>`;
    document.body.appendChild(el); icons(el);
    el.querySelector('.x').addEventListener('click', () => { try { speechSynthesis.cancel(); } catch (_) {} el.remove(); });
    el.querySelector('.tl-btn').addEventListener('click', () => { if (!speak(text, c)) STHub && toastSafe('Озвучка недоступна в этом браузере'); });
  }
  let toastSafe = t => {};
  async function copy(text) { try { await navigator.clipboard.writeText(text); toastSafe('Скопировано'); } catch (_) { toastSafe('Не удалось скопировать'); } }

  // Результат перевода: карточка с действиями
  function resultHtml(x, extra) {
    return `<div class="tl-res">
      <div class="tl-res-h"><span class="l">${flag(x.from)}${esc(nm(x.from))}</span>→<span class="l">${flag(x.to)}${esc(nm(x.to))}</span><em>${esc(ENGINE[x.engine] || '')}</em></div>
      <div class="tl-res-t" translate="no">${esc(x.tr)}</div>
      <div class="tl-res-acts">
        <button class="tl-act" type="button" data-r="say" aria-label="Озвучить"><i data-lucide="volume-2"></i></button>
        <button class="tl-act" type="button" data-r="copy" aria-label="Копировать"><i data-lucide="copy"></i></button>
        <button class="tl-act${isFav(x) ? ' fav' : ''}" type="button" data-r="fav" aria-label="В избранное"><i data-lucide="star"></i></button>
        <button class="tl-act" type="button" data-r="big" aria-label="Показать крупно"><i data-lucide="maximize-2"></i></button>
      </div>${extra || ''}</div>`;
  }
  function bindResult(root, x) {
    const q = s => root.querySelector('[data-r="' + s + '"]');
    q('say') && q('say').addEventListener('click', () => { if (!speak(x.tr, x.to)) toastSafe('Озвучка недоступна в этом браузере'); });
    q('copy') && q('copy').addEventListener('click', () => copy(x.tr));
    q('fav') && q('fav').addEventListener('click', e => { const on = toggleFav(x); e.currentTarget.classList.toggle('fav', on); toastSafe(on ? 'Добавлено в избранное' : 'Убрано из избранного'); });
    q('big') && q('big').addEventListener('click', () => bigView(x.tr, x.to, x.src));
  }

  // Переход из модуля «Офлайн» сразу на нужный экран
  let pendingView = null;

  STHub.registerService(ID, ctx => {
    toastSafe = t => ctx.toast(t);
    const trip = ctx.trip;
    const my = myLang();
    const saved = ctx.store.get('pair', null);
    const manual = saved?.manual === true && L[saved.target];
    const S = { a: my, b: manual ? saved.target : tripLang(trip), text: '', res: null, err: '', note: '', chat: [], auto: LS.get('autoSay', true), favTab: 'fav', cat: 'basic', phLang: null, camLang: null };
    const savePair = () => ctx.store.set('pair', { target: S.b, manual: true });
    const foreign = () => (S.a !== my ? S.a : S.b);
    const chooseTarget = next => pickLang('Язык поездки', S.b, c => { S.b = c; savePair(); next(); }, c => c !== my);

    // язык поездки ещё не известен — определим и поправим пару (если пользователь её не менял)
    if (!manual && trip && !tripCC(trip)) detectTripCC(trip).then(cc => { if (cc && !ctx.store.get('pair', null)?.manual) { S.b = tripLang(trip); if (cur?.id === 'tl-home') cur.refresh(); } });

    let cur = null;
    const screenOf = (id, title, render, back) => { cur = ctx.openScreen({ id, title, render, onBack: back || home }); cur.id = id; return cur; };

    // ===== Главный экран =====
    function home() {
      cur = ctx.openScreen({
        id: 'tl-home', title: ctx.title,
        render(body, screen) {
          const t = ctx.trip || {};
          const members = ctx.members?.length || 0;
          const memberLabel = window.STModuleUI.count(members, 'participant');
          body.innerHTML = `
            ${ctx.trip ? `<button class="hub-trip2" type="button" id="tl-trip" aria-label="Открыть текущую поездку">
              <span class="hub-trip2-ph on tl-trip-ph"><img id="tl-trip-photo" src="/img/trips/abstract.jpg" alt=""></span>
              <span class="hub-trip2-txt"><span class="hub-trip2-k"><i data-lucide="plane"></i>Текущая поездка</span>
                <span class="hub-trip2-name">${esc(t.name || 'Поездка')}</span>
                <span class="hub-trip2-meta">${esc(t.dest || '')}${t.dest && members ? ' <b>•</b> ' : ''}${members ? esc(memberLabel) : ''}</span>
              </span><span class="hub-trip2-go"><i data-lucide="chevron-right"></i></span>
            </button>` : `<button class="tl-create-trip" type="button" id="tl-trip"><i data-lucide="plus-circle"></i><span><b>Создать поездку</b><small>Добавьте направление и участников</small></span><i data-lucide="chevron-right"></i></button>`}
            <div class="tl-main">
              <div class="tl-pair">
                <button class="tl-lang" type="button" data-a="la">${flag(S.a)}${S.a.toUpperCase()}</button>
                <button class="tl-swap" type="button" data-a="swap" aria-label="Поменять языки" ${S.b ? '' : 'disabled'}><i data-lucide="arrow-left-right"></i></button>
                <button class="tl-lang" type="button" data-a="lb">${S.b ? `${flag(S.b)}${S.b.toUpperCase()}` : '<span class="tl-select-lang">Выбрать язык</span>'}</button>
              </div>
              <div class="tl-input"><textarea id="tl-in" rows="1" placeholder="Введите текст или говорите…" maxlength="2000">${esc(S.text)}</textarea>
                <button class="tl-mic" type="button" data-a="mic" aria-label="Сказать на «${esc(nm(S.a))}»"><i data-lucide="mic"></i></button></div>
              <div id="tl-out"></div>
            </div>
            <div class="tl-grid">
              <button class="tl-tile" type="button" data-go="talk"><span class="tl-ic"><i data-lucide="mic"></i></span><b>Разговор</b><small>Голосовой перевод<br>в реальном времени</small></button>
              <button class="tl-tile" type="button" data-go="cam"><span class="tl-ic"><i data-lucide="camera"></i></span><b>Камера</b><small>Перевод текста<br>с фото</small></button>
              <button class="tl-tile" type="button" data-go="phr"><span class="tl-ic"><i data-lucide="book-open"></i></span><b>Фразы</b><small>Готовые выражения<br>для путешествий</small></button>
              <button class="tl-tile" type="button" data-go="fav"><span class="tl-ic star"><i data-lucide="star"></i></span><b>Избранное</b><small>Сохранённые<br>переводы</small></button>
            </div>
            <button class="tl-dl" type="button" data-go="packs"><span class="tl-ic"><i data-lucide="download"></i></span><b>Скачать языки для офлайн</b><i data-lucide="chevron-right"></i></button>`;
          icons(body);
          if (ctx.trip && window.STPlacePhoto?.tripImg) STPlacePhoto.tripImg(body.querySelector('#tl-trip-photo'), ctx.trip, { width: 900 });
          body.querySelector('#tl-trip').addEventListener('click', () => ctx.trip ? STHub.openExpenses('pg-dash') : STHub.openCreate());
          const ta = body.querySelector('#tl-in'), out = body.querySelector('#tl-out');
          const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; };
          const show = () => {
            if (S.err) out.innerHTML = `<div class="tl-err">${esc(S.err)}</div>`;
            else if (S.res) { out.innerHTML = resultHtml(S.res, S.note ? `<div class="tl-note">${esc(S.note)}</div>` : ''); bindResult(out, S.res); }
            else out.innerHTML = S.text.trim() ? '<div class="tl-note">Перевожу…</div>' : '';
            icons(out);
          };
          let timer = null, seq = 0;
          const run = async (now) => {
            clearTimeout(timer);
            const text = S.text.trim();
            if (!text) { S.res = null; S.err = ''; S.note = ''; show(); return; }
            if (!S.b) { S.res = null; S.err = ''; out.innerHTML = '<div class="tl-note">Выберите второй язык для перевода.</div>'; return; }
            const go = async () => {
              const my_ = ++seq;
              const det = await detect(text);
              let from = S.a, to = S.b, note = '';
              if (det === S.b) { from = S.b; to = S.a; }
              else if (det && det !== S.a) { from = det; to = S.b; note = 'Определён язык: ' + nm(det).toLowerCase(); }
              try {
                const r = await translate(text, from, to);
                if (my_ !== seq) return;
                S.res = { from, to, src: text, tr: r.text, engine: r.engine }; S.err = ''; S.note = note;
                if (r.engine !== 'same') addHist(S.res);
              } catch (e) { if (my_ !== seq) return; S.res = null; S.err = errText(e); }
              show();
            };
            if (now) go(); else timer = setTimeout(go, 700);
          };
          ta.addEventListener('input', () => { S.text = ta.value; grow(); if (!S.res) show(); run(false); });
          ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(true); } });
          grow(); show();
          const $ = s => body.querySelector('[data-a="' + s + '"]');
          $('swap').addEventListener('click', () => { [S.a, S.b] = [S.b, S.a]; savePair(); if (S.res) { S.text = S.res.tr; S.res = null; } screen.refresh(); run(true); });
          $('la').addEventListener('click', () => pickLang('Первый язык', S.a, c => { S.a = c; screen.refresh(); run(true); }));
          $('lb').addEventListener('click', () => pickLang('Второй язык', S.b, c => { S.b = c; savePair(); screen.refresh(); run(true); }));
          const mic = $('mic');
          mic.addEventListener('click', async () => {
            if (mic.classList.contains('on')) { listen.stop && listen.stop(); return; }
            mic.classList.add('on');
            try { const t = await listen(S.a, s => { ta.value = s; grow(); }); S.text = t; ta.value = t; grow(); run(true); }
            catch (e) { ctx.toast(micErr(e)); }
            finally { mic.classList.remove('on'); }
          });
          body.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
            const go = ({ talk, cam, phr, fav, packs })[b.dataset.go];
            if (!foreign() && ['talk', 'phr', 'packs'].includes(b.dataset.go)) chooseTarget(go);
            else go();
          }));
        }
      });
      cur.id = 'tl-home';
    }

    // ===== Разговор =====
    function talk() {
      screenOf('tl-talk', 'Разговор', (body, screen) => {
        const them = foreign();
        body.innerHTML = `
          <div class="tl-card" style="display:flex;align-items:center;gap:10px;justify-content:center;font-weight:700">
            <button class="tl-chip" type="button" data-a="me">${flag(my)}Я · ${esc(nm(my))}</button><i data-lucide="arrow-left-right" style="width:18px;height:18px;color:#5b4bd6"></i>
            <button class="tl-chip" type="button" data-a="them">${flag(them)}${esc(nm(them))}</button></div>
          <div class="tl-chat" id="chat" style="margin-top:12px"></div>
          ${Rec ? '' : `<div class="tl-err">Голосовой ввод не поддерживается этим браузером (нужен Chrome). Можно печатать — перевод покажется крупно и озвучится.</div>
            <textarea class="tl-ta" id="tk-in" placeholder="Введите фразу…" style="margin-top:10px;min-height:70px"></textarea>`}
          <div class="tl-talk">
            <div class="tl-2">
              <button class="tl-btn" type="button" data-s="me"><i data-lucide="${Rec ? 'mic' : 'send'}"></i>${Rec ? 'Говорю я' : 'Я сказал'} · ${my.toUpperCase()}</button>
              <button class="tl-btn lite" type="button" data-s="them"><i data-lucide="${Rec ? 'mic' : 'send'}"></i>${Rec ? 'Собеседник' : 'Собеседник сказал'} · ${them.toUpperCase()}</button>
            </div>
            <label class="tl-sw"><span>Озвучивать перевод вслух</span><input type="checkbox" id="tk-say" ${S.auto ? 'checked' : ''}></label>
          </div>`;
        icons(body);
        const chat = body.querySelector('#chat');
        const draw = live => {
          chat.innerHTML = (S.chat.length || live ? '' : `<div class="st-empty"><i data-lucide="messages-square"></i><div>Нажмите кнопку и говорите.<br>Перевод появится здесь и прозвучит на языке собеседника.</div></div>`) +
            S.chat.map((m, i) => `<div class="tl-bub ${m.side}" data-i="${i}"><b>${esc(m.tr)}</b><small>${esc(m.src)}</small></div>`).join('') +
            (live ? `<div class="tl-bub ${live.side} live"><b>${esc(live.text || 'Слушаю…')}</b></div>` : '');
          icons(chat);
          chat.querySelectorAll('[data-i]').forEach(el => el.addEventListener('click', () => { const m = S.chat[+el.dataset.i]; bigView(m.tr, m.to, m.src); }));
          const last = chat.lastElementChild; if (last && last.scrollIntoView) last.scrollIntoView({ block: 'nearest' });
        };
        draw();
        body.querySelector('#tk-say').addEventListener('change', e => { S.auto = e.target.checked; LS.set('autoSay', S.auto); });
        body.querySelector('[data-a="them"]').addEventListener('click', () => pickLang('Язык собеседника', them, c => { if (c === my) return; if (S.a === my) S.b = c; else S.a = c; savePair(); screen.refresh(); }, c => c !== my));
        body.querySelector('[data-a="me"]').addEventListener('click', () => ctx.toast('Ваш язык — ' + nm(my).toLowerCase() + ' (язык приложения)'));
        const addMsg = async (side, src) => {
          const from = side === 'me' ? my : them, to = side === 'me' ? them : my;
          draw({ side, text: src });
          try {
            const r = await translate(src, from, to);
            const m = { side, from, to, src, tr: r.text };
            S.chat.push(m); addHist({ from, to, src, tr: r.text }); draw();
            if (S.auto) speak(r.text, to);
          } catch (e) { draw(); ctx.toast(errText(e)); }
        };
        body.querySelectorAll('[data-s]').forEach(btn => btn.addEventListener('click', async () => {
          const side = btn.dataset.s;
          if (!Rec) { const ta = body.querySelector('#tk-in'); const t = ta.value.trim(); if (!t) { ctx.toast('Введите фразу'); return; } ta.value = ''; addMsg(side, t); return; }
          if (btn.classList.contains('on')) { listen.stop && listen.stop(); return; }
          body.querySelectorAll('[data-s]').forEach(b => b.classList.remove('on'));
          btn.classList.add('on');
          try { speechSynthesis && speechSynthesis.cancel(); } catch (_) {}
          try { const t = await listen(side === 'me' ? my : them, s => draw({ side, text: s })); await addMsg(side, t); }
          catch (e) { draw(); ctx.toast(micErr(e)); }
          finally { btn.classList.remove('on'); }
        }));
      });
    }

    // ===== Камера =====
    function cam() {
      const ok = c => !!(L[c] && L[c].o);
      if (!S.camLang) S.camLang = ok(foreign()) ? foreign() : 'en';
      const st = { file: null, url: null, text: '', busy: '', pct: 0, res: null, err: '' };
      screenOf('tl-cam', 'Камера', (body, screen) => {
        const draw = () => {
          body.innerHTML = `
            <div class="tl-card">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
                <span style="font-weight:700">Язык текста на фото</span>
                <button class="tl-chip" type="button" data-a="lang">${flag(S.camLang)}${esc(nm(S.camLang))}<i data-lucide="chevron-down"></i></button>
              </div>
              <div class="tl-2" style="margin-top:12px">
                <button class="tl-btn" type="button" data-a="shot"><i data-lucide="camera"></i>Снять</button>
                <button class="tl-btn lite" type="button" data-a="pick"><i data-lucide="image"></i>Из галереи</button>
              </div>
              <div class="tl-note"><span>Меню, вывески, объявления, документы. Распознавание идёт на телефоне — фото никуда не отправляется.</span> <span>Перевод:</span> <span>${esc(nm(my))}</span></div>
            </div>
            ${st.url ? `<img class="tl-photo" src="${st.url}" alt="" style="margin-top:12px">` : ''}
            ${st.busy ? `<div class="tl-card" style="margin-top:12px"><b>${esc(st.busy)}</b><div class="tl-prog"><i style="width:${Math.round(st.pct * 100)}%"></i></div></div>` : ''}
            ${st.text && !st.busy ? `<div class="tl-sec">Распознанный текст — можно поправить</div><textarea class="tl-ta" id="cm-text" translate="no">${esc(st.text)}</textarea>
              <button class="tl-btn" type="button" data-a="tr" style="margin-top:10px"><i data-lucide="languages"></i>Перевести</button>` : ''}
            ${st.err ? `<div class="tl-err">${esc(st.err)}</div>` : ''}
            <div id="cm-res"></div>`;
          icons(body);
          const $ = s => body.querySelector('[data-a="' + s + '"]');
          $('lang').addEventListener('click', () => pickLang('Язык текста на фото', S.camLang, c => { S.camLang = c; draw(); }, c => ok(c) && c !== my));
          const pick = capture => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; if (capture) i.setAttribute('capture', 'environment');
            i.addEventListener('change', () => { const f = i.files && i.files[0]; if (f) process(f); }); i.click(); };
          $('shot').addEventListener('click', () => pick(true));
          $('pick').addEventListener('click', () => pick(false));
          if ($('tr')) $('tr').addEventListener('click', () => { st.text = body.querySelector('#cm-text').value; doTranslate(); });
          if (st.res) { const box = body.querySelector('#cm-res'); box.innerHTML = resultHtml(st.res); bindResult(box, st.res); icons(box); }
        };
        const doTranslate = async () => {
          const t = st.text.trim(); if (!t) return;
          const box = body.querySelector('#cm-res'); box.innerHTML = '<div class="tl-note">Перевожу…</div>';
          try { const r = await translate(t, S.camLang, my); st.res = { from: S.camLang, to: my, src: t, tr: r.text, engine: r.engine }; st.err = ''; addHist(st.res); }
          catch (e) { st.res = null; st.err = errText(e); }
          draw();
        };
        const process = async f => {
          if (st.url) URL.revokeObjectURL(st.url);
          st.file = f; st.url = URL.createObjectURL(f); st.text = ''; st.res = null; st.err = ''; st.busy = 'Готовлю распознавание…'; st.pct = 0; draw();
          let lastDraw = 0;
          try {
            st.text = await readPhoto(f, S.camLang, (s, p) => { st.busy = /recogniz/.test(s) ? 'Распознаю текст…' : 'Загружаю язык «' + nm(S.camLang) + '»…'; st.pct = p; if (Date.now() - lastDraw > 250) { lastDraw = Date.now(); draw(); } });
            st.busy = '';
            if (!st.text) { st.err = 'Текст на фото не найден. Снимите ближе, ровно и при хорошем освещении.'; draw(); return; }
            draw(); doTranslate();
          } catch (_) { st.busy = ''; st.err = 'Не удалось распознать текст. Если вы без интернета — скачайте язык заранее в «Скачать языки для офлайн».'; draw(); }
        };
        draw();
      });
    }

    // ===== Фразы =====
    function phr() {
      if (!S.phLang) S.phLang = foreign() || my;
      screenOf('tl-phr', 'Фразы', (body, screen) => {
        const c = S.phLang, list = phrases(c), mine = myLang() !== 'ru' ? phrases(myLang()) : null;
        const mean = i => (mine && mine[i]) || PH[i][1];
        body.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
            <span style="font-weight:700;color:var(--t2)">Язык</span>
            <button class="tl-chip" type="button" data-a="lang">${flag(c)}${esc(nm(c))}<i data-lucide="chevron-down"></i></button></div>
          <div class="tl-chips tl-cats">${CATS.map(([k, t, ic]) => `<button class="tl-chip${S.cat === k ? ' on' : ''}" type="button" data-cat="${k}"><i data-lucide="${ic}"></i><span>${t}</span></button>`).join('')}</div>
          ${list ? `<div class="tl-list" style="margin-top:8px">${PH.map((p, i) => p[0] !== S.cat ? '' : `
            <div class="tl-ph" data-i="${i}"><span><b translate="no">${esc(list[i])}</b>${mean(i) === list[i] ? '' : `<small${mean(i) === p[1] ? '' : ' translate="no"'}>${esc(mean(i))}</small>`}</span>
              <button class="tl-act" type="button" data-say="${i}" aria-label="Озвучить"><i data-lucide="volume-2"></i></button>
              <button class="tl-act${isFav({ from: 'ru', to: c, src: p[1] }) ? ' fav' : ''}" type="button" data-fav="${i}" aria-label="В избранное"><i data-lucide="star"></i></button></div>`).join('')}</div>
            <div class="tl-note">Нажмите на фразу, чтобы показать её собеседнику крупно. ${phraseState(c) === 'builtin' ? 'Фразы встроены в приложение и работают без интернета.' : 'Фразы скачаны и работают без интернета.'}</div>`
          : `<div class="tl-card" style="margin-top:8px"><b><span>Фразы ещё не скачаны:</span> <span>${esc(nm(c))}</span></b>
              <div class="tl-note">Скачайте их один раз, пока есть интернет, — потом они будут работать офлайн.</div>
              <button class="tl-btn" type="button" data-a="dl" style="margin-top:12px"><i data-lucide="download"></i>Скачать фразы</button><div class="tl-note" id="ph-st"></div></div>`}`;
        icons(body);
        body.querySelector('[data-a="lang"]').addEventListener('click', () => pickLang('Язык фраз', c, x => { S.phLang = x; screen.refresh(); }, x => x !== 'ru'));
        body.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { S.cat = b.dataset.cat; screen.refresh(); }));
        body.querySelectorAll('[data-i]').forEach(el => el.addEventListener('click', e => { if (e.target.closest('button')) return; const i = +el.dataset.i; bigView(list[i], c, mean(i) === list[i] ? '' : mean(i)); }));
        body.querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', () => { if (!speak(list[+b.dataset.say], c)) ctx.toast('Озвучка недоступна в этом браузере'); }));
        body.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.fav; const on = toggleFav({ from: 'ru', to: c, src: PH[i][1], tr: list[i] }); b.classList.toggle('fav', on); ctx.toast(on ? 'Добавлено в избранное' : 'Убрано из избранного'); }));
        const dl = body.querySelector('[data-a="dl"]');
        if (dl) dl.addEventListener('click', async () => {
          if (!online()) { ctx.toast('Нужен интернет'); return; }
          dl.disabled = true; const stEl = body.querySelector('#ph-st');
          const out = [];
          try {
            const prev = LS.get('pb_' + c, null) || [];
            for (let i = 0; i < PH.length; i++) { if (prev[i]) { out.push(prev[i]); continue; } stEl.textContent = 'Скачиваю: ' + (i + 1) + ' из ' + PH.length; const r = await translate(PH[i][1], 'ru', c); out.push(r.text); if (r.engine === 'online') await pause(250); }
            LS.set('pb_' + c, out); ctx.toast('Фразы скачаны'); screen.refresh();
          } catch (e) { dl.disabled = false; stEl.textContent = errText(e); }
        });
      });
    }

    // ===== Избранное и история =====
    function fav() {
      screenOf('tl-fav', 'Избранное', (body, screen) => {
        const list = S.favTab === 'fav' ? favs() : hist();
        body.innerHTML = `
          <div class="tl-tabs"><button type="button" data-t="fav" class="${S.favTab === 'fav' ? 'on' : ''}">Избранное</button><button type="button" data-t="hist" class="${S.favTab === 'hist' ? 'on' : ''}">История</button></div>
          <div class="tl-list" style="margin-top:12px">${list.length ? list.map((x, i) => `
            <div class="tl-ph" data-i="${i}"><span><b translate="no">${esc(x.tr)}</b><small>${flag(x.from, 'tl-flag" style="width:16px;height:16px;vertical-align:-3px;margin-right:4px')}${esc(x.src)}</small></span>
              <button class="tl-act" type="button" data-say="${i}" aria-label="Озвучить"><i data-lucide="volume-2"></i></button>
              ${S.favTab === 'fav' ? `<button class="tl-act" type="button" data-del="${i}" aria-label="Удалить"><i data-lucide="trash-2"></i></button>`
                : `<button class="tl-act${isFav(x) ? ' fav' : ''}" type="button" data-fav="${i}" aria-label="В избранное"><i data-lucide="star"></i></button>`}</div>`).join('')
            : `<div class="st-empty"><i data-lucide="${S.favTab === 'fav' ? 'star' : 'history'}"></i><div>${S.favTab === 'fav' ? 'Нажмите ☆ у перевода или фразы — она появится здесь и будет доступна без интернета.' : 'Здесь появятся ваши последние переводы.'}</div></div>`}</div>
          ${S.favTab === 'hist' && list.length ? '<button class="tl-btn lite" type="button" data-a="clear" style="margin-top:14px"><i data-lucide="trash-2"></i>Очистить историю</button>' : ''}`;
        icons(body);
        body.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { S.favTab = b.dataset.t; screen.refresh(); }));
        body.querySelectorAll('[data-i]').forEach(el => el.addEventListener('click', e => { if (e.target.closest('button')) return; const x = list[+el.dataset.i]; bigView(x.tr, x.to, x.src); }));
        body.querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', () => { const x = list[+b.dataset.say]; if (!speak(x.tr, x.to)) ctx.toast('Озвучка недоступна в этом браузере'); }));
        body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { toggleFav(list[+b.dataset.del]); screen.refresh(); }));
        body.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', () => { const on = toggleFav(list[+b.dataset.fav]); b.classList.toggle('fav', on); }));
        const cl = body.querySelector('[data-a="clear"]'); if (cl) cl.addEventListener('click', () => { LS.set('hist', []); screen.refresh(); });
      });
    }

    // ===== Языки для офлайна =====
    function packs() {
      const order = [foreign() || my, ...CODES.filter(c => c !== foreign() && c !== my)];
      const st = { busy: null, msg: '', stat: {} };
      screenOf('tl-packs', 'Языки офлайн', (body, screen) => {
        const chip = (cls, ic, t) => `<span class="${cls}"><i data-lucide="${ic}"></i>${esc(t)}</span>`;
        const row = c => {
          const s = st.stat[c];
          const chips = !s ? '<span class="no">Проверяю…</span>' : [
            s.phrases === 'need' ? chip('need', 'download', 'Фразы: нужна загрузка') : chip('ok', 'circle-check', s.phrases === 'builtin' ? 'Фразы встроены' : 'Фразы скачаны'),
            s.device === 'available' ? chip('ok', 'circle-check', 'Перевод текста без сети') : (s.device === 'downloadable' || s.device === 'downloading') ? chip('need', 'download', 'Перевод текста: нужна загрузка') : chip('no', 'wifi', 'Перевод текста — только онлайн'),
            s.ocr === 'none' ? chip('no', 'camera-off', 'Фото: язык не поддерживается') : s.ocr === 'saved' ? chip('ok', 'circle-check', 'Текст с фото офлайн') : chip('need', 'download', 'Фото: нужна загрузка'),
            s.voice ? chip('ok', 'volume-2', 'Озвучка есть') : chip('no', 'volume-x', 'Нет голоса на устройстве')
          ].join('');
          const need = s && (s.phrases === 'need' || s.device === 'downloadable' || s.ocr === 'need');
          return `<div class="tl-pk"><div class="tl-pk-h">${flag(c)}<b>${esc(nm(c))}</b>${s && need ? `<button type="button" data-dl="${c}" ${st.busy ? 'disabled' : ''}>${st.busy === c ? 'Скачиваю…' : 'Скачать'}</button>` : ''}</div>
            <div class="tl-st">${chips}</div>${st.busy === c ? `<div class="tl-note" id="pk-note-${c}">${esc(st.msg)}</div>` : ''}</div>`;
        };
        body.innerHTML = `
          <div class="tl-card"><b>Что работает без интернета</b>
            <div class="tl-note">• Разговорник, избранное и история — всегда.<br>• Перевод любого текста — если браузер умеет переводить на устройстве (Chrome на компьютере), иначе нужен интернет.<br>• Текст с фото — после загрузки языка.<br>• Распознавание речи обычно требует интернет; озвучка работает, если на телефоне есть голос этого языка.</div></div>
          <div class="tl-sec">Язык поездки</div><div class="tl-list">${row(order[0])}</div>
          <div class="tl-sec">Другие языки</div><div class="tl-list">${order.slice(1).map(row).join('')}</div>`;
        icons(body);
        body.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', async () => {
          const c = b.dataset.dl;
          if (!online()) { ctx.toast('Нужен интернет, чтобы скачать язык'); return; }
          st.busy = c; st.msg = ''; screen.refresh();
          try { await downloadLang(c, my, t => { st.msg = t; const n = body.querySelector('#pk-note-' + c); if (n) n.textContent = t; }); } catch (_) {}
          st.busy = null; st.msg = ''; st.stat[c] = await langStatus(c, my); ctx.toast('Готово: ' + nm(c)); screen.refresh();
        }));
        order.forEach(async c => { if (st.stat[c]) return; st.stat[c] = await langStatus(c, my); if (!st.busy) screen.refresh(); });
      });
    }

    const v = pendingView; pendingView = null;
    if (v === 'packs') { home(); packs(); } else home();
  });

  // ---------- Для модуля «Офлайн» ----------
  window.STTranslator = {
    name: nm, flag, myLang, tripLang, tripCC, detectTripCC,
    status: (c, my) => langStatus(c, my),
    download: (c, my, onStep) => downloadLang(c, my, onStep),
    ocrFile: c => (L[c] && L[c].o ? OCR + 'lang/' + L[c].o + '.traineddata.gz' : null),
    coreFile: () => OCR + coreFile(),
    open(view) { pendingView = view || null; STHub.openService(ID); }
  };
})();
