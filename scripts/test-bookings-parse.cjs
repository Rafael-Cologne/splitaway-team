// Тесты разбора броней: node scripts/test-bookings-parse.cjs
const T = require(process.env.TOOLS || '../public/js/modules/bookings-tools.js');
const fs = require('fs'), path = require('path');
const base = process.env.DATA || path.join(__dirname, '../public/data');
const db = T.makeDb(JSON.parse(fs.readFileSync(base + '/airports.json')), JSON.parse(fs.readFileSync(base + '/airlines.json')));
const today = new Date(2026, 10, 15);
let fail = 0;
function check(name, text, exp) {
  const r = T.parseBooking(text, db, { today, currency: 'EUR' });
  const errs = [];
  const get = (o, k) => k.split('.').reduce((a, x) => a == null ? a : a[x], o);
  for (const [k, v] of Object.entries(exp)) { const got = get(r, k); if (JSON.stringify(got) !== JSON.stringify(v)) errs.push(`${k}: ждали ${JSON.stringify(v)}, получили ${JSON.stringify(got)}`); }
  console.log((errs.length ? '✗ ' : '✓ ') + name); errs.forEach(e => console.log('    ' + e));
  if (errs.length) { fail++; if (process.env.V) console.log(JSON.stringify(r, null, 1)); }
}
check('Lufthansa, подтверждение (DE)', `Ihre Buchungsbestätigung
Buchungscode: X7KQ2M
Reisende: MUSTERMANN/MAX MR, MUSTERMANN/ANNA MRS
Hinflug  Di, 12.05.2026
LH 1132  Frankfurt (FRA)  06:30  →  Alicante (ALC)  09:45  Economy
Rückflug  Mi, 20.05.2026
LH 1133  Alicante (ALC)  10:35  →  Frankfurt (FRA)  13:50
Sitzplatz: 12A   Sitzplatz: 12B
Gesamtpreis: 689,00 EUR
Buchungsdatum: 02.02.2026`, {
  cat: 'flight', 'segments.length': 2, 'segments.0.from': 'FRA', 'segments.0.to': 'ALC', 'segments.0.date': '2026-05-12', 'segments.0.time': '06:30', 'segments.0.endTime': '09:45',
  'segments.0.number': 'LH1132', 'segments.0.provider': 'Lufthansa', 'segments.1.from': 'ALC', 'segments.1.to': 'FRA', 'segments.1.date': '2026-05-20', 'segments.1.time': '10:35',
  code: 'X7KQ2M', people: '2 пассажира', seats: '12A, 12B', price: 689, currency: 'EUR' });
check('Boarding pass (EN), boarding time skipped', `BOARDING PASS
Ryanair
Passenger  MR JOHN SMITH
Flight FR 2345   Date 18 MAY 2026
From  CGN  Cologne        To  ALC Alicante
Boarding 05:35   Gate closes 06:00
Departure 06:10   Arrival 08:50
Seat 14C
Booking reference: QW3ERT`, {
  cat: 'flight', boarding: true, 'segments.0.from': 'CGN', 'segments.0.to': 'ALC', 'segments.0.date': '2026-05-18', 'segments.0.time': '06:10', 'segments.0.endTime': '08:50',
  'segments.0.number': 'FR2345', 'segments.0.provider': 'Ryanair', code: 'QW3ERT', seats: '14C' });
check('Open-jaw: туда в ALC, обратно из VLC', `Eurowings Booking confirmation  Booking code ABC12D
Outbound flight  Tue 12 May 2026  EW 582  DUS - ALC  07:15 - 10:05
Return flight  Sat 23 May 2026  EW 9583  VLC - CGN  18:40 - 21:10
Total price  € 412.98`, {
  cat: 'flight', 'segments.length': 2, 'segments.0.from': 'DUS', 'segments.0.to': 'ALC', 'segments.1.from': 'VLC', 'segments.1.to': 'CGN', 'segments.1.date': '2026-05-23',
  'segments.1.time': '18:40', 'segments.1.endTime': '21:10', 'segments.0.provider': 'Eurowings', code: 'ABC12D', price: 412.98, currency: 'EUR' });
check('Ночной рейс: прилёт на следующий день', `Flight EK 46  FRA → DXB  12.05.2026  21:55  06:30`, {
  'segments.0.date': '2026-05-12', 'segments.0.endDate': '2026-05-13', 'segments.0.provider': 'Emirates' });
check('Booking.com: апартаменты (DE)', `Booking.com
Ihre Buchung im Apartment Alicante ist bestätigt
Buchungsnummer: 4512889301
Calle La Mata 12, 03181 Torrevieja, Spanien
Anreise  Di., 12. Mai 2026  ab 15:00
Abreise  Mi., 20. Mai 2026  bis 11:00
2 Erwachsene, 2 Kinder
Gesamtpreis € 1.248,00
Kostenlose Stornierung bis 01.05.2026`, {
  cat: 'stay', title: 'Apartment Alicante', date: '2026-05-12', time: '15:00', endDate: '2026-05-20', endTime: '11:00',
  place: 'Calle La Mata 12, 03181 Torrevieja, Spanien', code: '4512889301', people: '2 взрослых, 2 детей', price: 1248, provider: 'Booking.com' });
check('Sixt: аренда авто (DE)', `SIXT Reservierungsbestätigung
Reservierungsnummer: 9876543210
Abholung: Flughafen Alicante  12.05.2026 10:30
Rückgabe: Flughafen Valencia  20.05.2026 09:00
Gesamtbetrag: 214,50 EUR`, {
  cat: 'transport', title: 'Аренда авто', provider: 'Sixt', date: '2026-05-12', time: '10:30', endDate: '2026-05-20', endTime: '09:00',
  place: 'Flughafen Alicante', placeTo: 'Flughafen Valencia', code: '9876543210', price: 214.5 });
check('Экскурсия, билет (ES)', `Entrada Castillo de Santa Bárbara
Fecha: 18/05/2026  Hora: 11:00
2 adultos, 2 niños
Total: 44,00 €`, { cat: 'ticket', title: 'Entrada Castillo de Santa Bárbara', date: '2026-05-18', time: '11:00', people: '2 взрослых, 2 детей', price: 44 });
check('Аэрофлот, подтверждение (RU)', `Маршрутная квитанция
Код бронирования: KJH7TR
Рейс SU 2310  Москва (SVO) — Кёльн (CGN)  12 мая 2026  10:20  12:30
Пассажир: Г-н Иванов Иван
Итого к оплате: 34 500 руб`, {
  cat: 'flight', 'segments.0.from': 'SVO', 'segments.0.to': 'CGN', 'segments.0.date': '2026-05-12', 'segments.0.provider': 'Aeroflot', code: 'KJH7TR', price: 34500, currency: 'RUB' });
check('Booking.com Berlin — фото, распознанный текст (OCR, колонки)', "B     ki           Ey                                               Buchungsbestatigung\n00   Ing.                                          Buchungsnummer: 5643 2789 1047\nPIN-Code: 7359\n©  Ihre Buchung ist bestätigt!\nVielen Dank, Rafael! Ihre Buchung im Hotel NH Collection Berlin Mitte Friedrichstrasse ist bestätigt.\ny       y            \"NH Collection Berlin Mitte                       ES\nf         ‘dg                              .      N\n|                    || Friedrichstrasse\n|  i J          } ) =       1                                                                            NH\ni   | |     LSA                                                                            COLLECTION\n|  JJ =      1 |  au.     |        © Friedrichstraße 96, 10117 Berlin,                             HOTELS\n01 |      Re      -\ni an  [       od |               Deutschland\n5   Check-in                      [m]   Check-out                 ©   Aufenthalt              X   Gäste\nMo., 17. Nov. 2026                   Mo,, 1. Dez. 2026                 14 Nächte                      2 Erwachsene\nab 15:00 Uhr                              bis 12:00 Uhr\n_—           Superior Doppelzimmer                        + Kostenlose Stornierung\n|                       A 1groBes Doppelbett                                                bis 15. Nov. 2026, 23:59 Uhr\ni          Ls     |Z Kostenfreies WLAN\n% Klimaanlage\nod             (> Kaffee-/Teezubehor\nPreisübersicht                                                   (@ Wichtige Informationen\nZimmer (14 Nächte)                                    2.268,00 €           +/ Kostenlose Stornierung bis 15. Nov. 2026\nSteuern und Gebühren                                    inklusive           +/ Keine Vorauszahlung erforderlich\n«/ Zahlung vor Ort im Hotel\nGesamtpreis                             2.268,00 €         Check-in ab 15:00 Uhr\nA                                                                          «/ Check-out bis 12:00 Uhr\nZahlung im Hotel\nVerwalten Sie Ihre Buchung in der      king.com\n0    Cia)       Sl     „     ching    d    Boo  ny ©   App                           Buchung verwalten\nBuchung ansehen, ändern oder stornieren - jederzeit und überall.\n", {
  cat: 'stay', title: 'Hotel NH Collection Berlin Mitte Friedrichstrasse', place: 'Friedrichstraße 96, 10117 Berlin, Deutschland',
  date: '2026-11-17', time: '15:00', endDate: '2026-12-01', endTime: '12:00', code: '564327891047', note: 'PIN-код: 7359',
  people: '2 взрослых', price: 2268, currency: 'EUR', provider: 'Booking.com' });
console.log(fail ? `\n${fail} тест(ов) не прошли` : '\nВсе тесты прошли');
process.exit(fail ? 1 : 0);
