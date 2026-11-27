// Static translations for service screens. The catalogue contains interface copy only;
// user-entered values and messages are never sent to a translation service at runtime.
(function () {
  'use strict';
  const data = window.ST_MODULE_UI_LOCALES;
  if (!data || !Array.isArray(data.ru)) return;
  const codes = ['ru', 'en', 'de', 'fr', 'it', 'es', 'pt', 'pl', 'el', 'tr'];
  const locales = { ru:'ru-RU', en:'en-GB', de:'de-DE', fr:'fr-FR', it:'it-IT', es:'es-ES', pt:'pt-PT', pl:'pl-PL', el:'el-GR', tr:'tr-TR' };
  const nouns = {
    participant: { ru:['участник','участника','участников'], en:['participant','participants'], de:['Teilnehmer','Teilnehmer'], fr:['participant','participants'], it:['partecipante','partecipanti'], es:['participante','participantes'], pt:['participante','participantes'], pl:['uczestnik','uczestników','uczestników'], el:['συμμετέχων','συμμετέχοντες'], tr:['katılımcı','katılımcı'] },
    entry: { ru:['запись','записи','записей'], en:['entry','entries'], de:['Eintrag','Einträge'], fr:['entrée','entrées'], it:['voce','voci'], es:['entrada','entradas'], pt:['registo','registos'], pl:['wpis','wpisy','wpisów'], el:['καταχώριση','καταχωρίσεις'], tr:['kayıt','kayıt'] },
    expense: { ru:['расход','расхода','расходов'], en:['expense','expenses'], de:['Ausgabe','Ausgaben'], fr:['dépense','dépenses'], it:['spesa','spese'], es:['gasto','gastos'], pt:['despesa','despesas'], pl:['wydatek','wydatki','wydatków'], el:['έξοδο','έξοδα'], tr:['harcama','harcama'] },
    day: { ru:['день','дня','дней'], en:['day','days'], de:['Tag','Tage'], fr:['jour','jours'], it:['giorno','giorni'], es:['día','días'], pt:['dia','dias'], pl:['dzień','dni','dni'], el:['ημέρα','ημέρες'], tr:['gün','gün'] },
    booking: { ru:['бронь','брони','броней'], en:['booking','bookings'], de:['Buchung','Buchungen'], fr:['réservation','réservations'], it:['prenotazione','prenotazioni'], es:['reserva','reservas'], pt:['reserva','reservas'], pl:['rezerwacja','rezerwacje','rezerwacji'], el:['κράτηση','κρατήσεις'], tr:['rezervasyon','rezervasyon'] },
    place: { ru:['место','места','мест'], en:['place','places'], de:['Ort','Orte'], fr:['lieu','lieux'], it:['luogo','luoghi'], es:['lugar','lugares'], pt:['lugar','lugares'], pl:['miejsce','miejsca','miejsc'], el:['μέρος','μέρη'], tr:['yer','yer'] },
    currency: { ru:['валюта','валюты','валют'], en:['currency','currencies'], de:['Währung','Währungen'], fr:['devise','devises'], it:['valuta','valute'], es:['divisa','divisas'], pt:['moeda','moedas'], pl:['waluta','waluty','walut'], el:['νόμισμα','νομίσματα'], tr:['para birimi','para birimi'] }
  };
  function noun(n, type) {
    const forms = nouns[type]?.[current()] || nouns[type]?.en;
    if (!forms) return type;
    if (current() === 'ru') { const x = Math.abs(n) % 10, y = Math.abs(n) % 100; return forms[x === 1 && y !== 11 ? 0 : x >= 2 && x <= 4 && (y < 12 || y > 14) ? 1 : 2]; }
    if (current() === 'pl') { const x = Math.abs(n) % 10, y = Math.abs(n) % 100; return forms[n === 1 ? 0 : x >= 2 && x <= 4 && (y < 12 || y > 14) ? 1 : 2]; }
    return forms[n === 1 ? 0 : 1];
  }
  const count = (n, type) => `${n} ${noun(n, type)}`;
  const progress = (done, total) => ({ ru:`${done} из ${total} выполнено`, en:`${done} of ${total} completed`, de:`${done} von ${total} erledigt`, fr:`${done} sur ${total} terminés`, it:`${done} di ${total} completati`, es:`${done} de ${total} completados`, pt:`${done} de ${total} concluídos`, pl:`Ukończono ${done} z ${total}`, el:`Ολοκληρώθηκαν ${done} από ${total}`, tr:`${total} öğeden ${done} tamamlandı` })[current()] || `${done} of ${total} completed`;
  const index = new Map();
  data.ru.forEach((phrase, i) => index.set(phrase, i));
  const current = () => typeof getLang === 'function' ? getLang() : 'ru';
  function translate(value) {
    const lang = current();
    if (lang === 'ru' || !codes.includes(lang)) return value;
    const source = String(value);
    const prefix = source.match(/^\s*/)[0], suffix = source.match(/\s*$/)[0];
    const phrase = source.trim().replace(/\s+/g, ' ');
    const i = index.get(phrase);
    if (i === undefined) return value;
    const result = data[lang]?.[i];
    return result ? prefix + result + suffix : value;
  }
  const skip = element => !element || element.closest('script,style,[contenteditable],[translate="no"],.ai-me,#pg-app,#pg-ob,#pg-hub');
  function localize(root) {
    if (current() === 'ru' || !root) return;
    const visit = element => {
      if (!element || skip(element)) return;
      for (const attr of ['placeholder', 'title', 'aria-label']) {
        const before = element.getAttribute?.(attr);
        if (before) {
          const after = translate(before);
          if (after !== before) element.setAttribute(attr, after);
        }
      }
      for (const child of element.childNodes || []) {
        if (child.nodeType === 3) {
          if (/[А-Яа-яЁё]/.test(child.nodeValue || '')) child.nodeValue = translate(child.nodeValue);
        } else if (child.nodeType === 1) visit(child);
      }
    };
    if (root.nodeType === 3) {
      if (!skip(root.parentElement)) root.nodeValue = translate(root.nodeValue);
    } else if (root.nodeType === 1) visit(root);
  }
  function start() {
    localize(document.body);
    new MutationObserver(records => {
      if (current() === 'ru') return;
      for (const record of records) {
        if (record.type === 'attributes') localize(record.target);
        for (const node of record.addedNodes) localize(node);
      }
    }).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['placeholder','title','aria-label'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
  window.STModuleUI = { translate, localize, noun, count, progress, locale: () => locales[current()] || 'en-GB' };
})();
