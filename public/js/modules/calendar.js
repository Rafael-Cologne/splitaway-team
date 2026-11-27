// ============================================================
// Модуль «Календарь» (id: 'calendar')
// Ответственный: Рафаэль · Issue #15
// ------------------------------------------------------------
// Три страницы:
//   1. Месяц  — календарь на месяц, даты поездки, точки событий,
//               листание влево/вправо (свайп или стрелки).
//   2. События — неделя лентой + события выбранного дня по времени,
//               листание недель свайпом.
//   3. Добавить / изменить событие — тип, название, дата, время,
//               место, заметка, напоминание, фото билета.
// Данные хранятся для каждой поездки на этом устройстве (ctx.store).
// Даты поездки в базе и общий календарь группы — следующий этап.
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const CAL_KEYS = ['trip','mine','all','calendar','more','prevMonth','nextMonth','addEvent','tripDates','today','deletePast','noPast','confirmPast','start','end','save','clearDates','bothDates','endBeforeStart','tripTooLong','setTripDates','event','booking','note','weatherDay','rain','noEvents','member','members','flight','stay','transport','arrival','food','ticket','other','allDay'];
  const CAL_TEXT = {
    ru:'Поездка|Мои|Все|Календарь|Ещё|Предыдущий месяц|Следующий месяц|Добавить событие|Даты поездки|Перейти к сегодня|Удалить прошедшие события|Прошедших событий нет|Удалить все прошедшие события?|Начало|Конец|Сохранить|Убрать даты|Укажите обе даты|Конец не может быть раньше начала|Поездка длиннее 90 дней — проверьте даты|Укажите даты поездки|Событие|Бронь|Заметка|Погода на этот день|дождь|В этот день событий нет. Нажмите «+», чтобы добавить.|участник|участников|Перелёт|Проживание|Транспорт|Прилёт|Еда|Билеты|Другое|весь день',
    en:'Trip|Mine|All|Calendar|More|Previous month|Next month|Add event|Trip dates|Go to today|Delete past events|No past events|Delete all past events?|Start|End|Save|Remove dates|Enter both dates|End cannot be before start|Trip exceeds 90 days — check the dates|Set trip dates|Event|Booking|Note|Weather for this day|rain|No events on this day. Tap “+” to add one.|member|members|Flight|Stay|Transport|Arrival|Food|Tickets|Other|all day',
    de:'Reise|Meine|Alle|Kalender|Mehr|Vorheriger Monat|Nächster Monat|Ereignis hinzufügen|Reisedaten|Zu heute springen|Vergangene Ereignisse löschen|Keine vergangenen Ereignisse|Alle vergangenen Ereignisse löschen?|Beginn|Ende|Speichern|Daten entfernen|Beide Daten eingeben|Das Ende darf nicht vor dem Beginn liegen|Reise länger als 90 Tage — Daten prüfen|Reisedaten eingeben|Ereignis|Buchung|Notiz|Wetter für diesen Tag|Regen|Keine Ereignisse an diesem Tag. Tippe auf „+“, um eines hinzuzufügen.|Teilnehmer|Teilnehmer|Flug|Unterkunft|Transport|Ankunft|Essen|Tickets|Sonstiges|ganztägig',
    fr:'Voyage|Mes événements|Tout|Calendrier|Plus|Mois précédent|Mois suivant|Ajouter un événement|Dates du voyage|Aller à aujourd’hui|Supprimer les événements passés|Aucun événement passé|Supprimer tous les événements passés ?|Début|Fin|Enregistrer|Supprimer les dates|Saisissez les deux dates|La fin ne peut pas précéder le début|Le voyage dépasse 90 jours — vérifiez les dates|Définir les dates du voyage|Événement|Réservation|Note|Météo de ce jour|pluie|Aucun événement ce jour. Touchez « + » pour en ajouter un.|participant|participants|Vol|Hébergement|Transport|Arrivée|Repas|Billets|Autre|toute la journée',
    it:'Viaggio|Miei|Tutti|Calendario|Altro|Mese precedente|Mese successivo|Aggiungi evento|Date del viaggio|Vai a oggi|Elimina eventi passati|Nessun evento passato|Eliminare tutti gli eventi passati?|Inizio|Fine|Salva|Rimuovi le date|Inserisci entrambe le date|La fine non può precedere l’inizio|Il viaggio supera 90 giorni — controlla le date|Imposta le date del viaggio|Evento|Prenotazione|Nota|Meteo di questo giorno|pioggia|Nessun evento in questo giorno. Tocca «+» per aggiungerne uno.|partecipante|partecipanti|Volo|Soggiorno|Trasporto|Arrivo|Cibo|Biglietti|Altro|tutto il giorno',
    es:'Viaje|Míos|Todos|Calendario|Más|Mes anterior|Mes siguiente|Añadir evento|Fechas del viaje|Ir a hoy|Eliminar eventos pasados|No hay eventos pasados|¿Eliminar todos los eventos pasados?|Inicio|Fin|Guardar|Quitar fechas|Indica ambas fechas|El fin no puede ser anterior al inicio|El viaje supera 90 días: revisa las fechas|Indica las fechas del viaje|Evento|Reserva|Nota|Tiempo para este día|lluvia|No hay eventos este día. Toca «+» para añadir uno.|participante|participantes|Vuelo|Alojamiento|Transporte|Llegada|Comida|Entradas|Otro|todo el día',
    pt:'Viagem|Meus|Todos|Calendário|Mais|Mês anterior|Mês seguinte|Adicionar evento|Datas da viagem|Ir para hoje|Eliminar eventos passados|Sem eventos passados|Eliminar todos os eventos passados?|Início|Fim|Guardar|Remover datas|Indique ambas as datas|O fim não pode ser anterior ao início|A viagem ultrapassa 90 dias — verifique as datas|Indique as datas da viagem|Evento|Reserva|Nota|Meteorologia para este dia|chuva|Sem eventos neste dia. Toque em «+» para adicionar.|participante|participantes|Voo|Alojamento|Transporte|Chegada|Comida|Bilhetes|Outro|o dia todo',
    pl:'Podróż|Moje|Wszystkie|Kalendarz|Więcej|Poprzedni miesiąc|Następny miesiąc|Dodaj wydarzenie|Daty podróży|Przejdź do dziś|Usuń minione wydarzenia|Brak minionych wydarzeń|Usunąć wszystkie minione wydarzenia?|Początek|Koniec|Zapisz|Usuń daty|Podaj obie daty|Koniec nie może być przed początkiem|Podróż trwa ponad 90 dni — sprawdź daty|Ustaw daty podróży|Wydarzenie|Rezerwacja|Notatka|Pogoda na ten dzień|deszcz|Brak wydarzeń w tym dniu. Dotknij „+”, aby dodać.|uczestnik|uczestnicy|Lot|Nocleg|Transport|Przylot|Jedzenie|Bilety|Inne|cały dzień',
    el:'Ταξίδι|Δικά μου|Όλα|Ημερολόγιο|Περισσότερα|Προηγούμενος μήνας|Επόμενος μήνας|Προσθήκη συμβάντος|Ημερομηνίες ταξιδιού|Μετάβαση στο σήμερα|Διαγραφή παλιών συμβάντων|Δεν υπάρχουν παλιά συμβάντα|Διαγραφή όλων των παλιών συμβάντων;|Έναρξη|Λήξη|Αποθήκευση|Αφαίρεση ημερομηνιών|Εισαγάγετε και τις δύο ημερομηνίες|Η λήξη δεν μπορεί να προηγείται της έναρξης|Το ταξίδι υπερβαίνει τις 90 ημέρες — ελέγξτε τις ημερομηνίες|Ορίστε ημερομηνίες ταξιδιού|Συμβάν|Κράτηση|Σημείωση|Καιρός για αυτή την ημέρα|βροχή|Δεν υπάρχουν συμβάντα σήμερα. Πατήστε «+» για προσθήκη.|συμμετέχων|συμμετέχοντες|Πτήση|Διαμονή|Μεταφορά|Άφιξη|Φαγητό|Εισιτήρια|Άλλο|όλη μέρα',
    tr:'Gezi|Benim|Tümü|Takvim|Diğer|Önceki ay|Sonraki ay|Etkinlik ekle|Gezi tarihleri|Bugüne git|Geçmiş etkinlikleri sil|Geçmiş etkinlik yok|Tüm geçmiş etkinlikler silinsin mi?|Başlangıç|Bitiş|Kaydet|Tarihleri kaldır|Her iki tarihi de girin|Bitiş başlangıçtan önce olamaz|Gezi 90 günü aşıyor — tarihleri kontrol edin|Gezi tarihlerini belirleyin|Etkinlik|Rezervasyon|Not|Bu günün hava durumu|yağmur|Bu gün etkinlik yok. Eklemek için «+»ya dokunun.|katılımcı|katılımcı|Uçuş|Konaklama|Ulaşım|Varış|Yemek|Biletler|Diğer|tüm gün'
  };
  const calLocale = () => (typeof getLang === 'function' ? getLang() : 'ru');
  const c = key => (CAL_TEXT[calLocale()] || CAL_TEXT.en).split('|')[CAL_KEYS.indexOf(key)] || key;
  const FORM_KEYS = ['title','date','timeOptional','dateIfOther','dateTime','place','noteOptional','reminder','customType','custom','myEvents','minutes30','hour1','hours2','day1','attachMax','addTicket','addDocument','attached','tapPhoto','multiplePhotos','photoTicket','removePhoto','deleteEvent','onlyPhotos','maxPhotos','imageError','deleted','newType','editType','exampleConcert','icon','replaceImage','ownImage','color','create','deleteType','selectImage','enterTitle','selectDate','endTimeBefore','eventTooLong','memoryImage','saved','added','checkIn','checkOut','departure','landing','finish','day','of'];
  const FORM_TEXT = {
    ru:'Название|Дата|Время (необязательно)|Дата (если другой день)|дата и время|Место|Заметка (необязательно)|Напоминание|Свой тип события|Своё|Мои события|За 30 минут|За 1 час|За 2 часа|За 1 день|Прикреплено {n} — это максимум|Добавить ещё билет|Добавить документ / билет|Прикреплено: {n}|нажмите на фото, чтобы открыть|Можно несколько фото, например билеты на двоих|Билет {n}|Убрать фото|Удалить событие|Пока можно прикрепить только фото или скриншот|Можно прикрепить не больше {n} фото|Не получилось открыть картинку|Событие удалено|Новый тип события|Свой тип|Например: Концерт|Иконка|Заменить свою картинку|Своя иконка или фото|Цвет|Создать|Удалить тип|Выберите картинку или фото|Введите название|Выберите дату|Время окончания раньше начала|Событие длиннее 90 дней — проверьте даты|Не хватает памяти: попробуйте картинку меньше|Сохранено|Событие добавлено|Заезд|Выезд|Вылет|Прилёт|Окончание|день|из',
    en:'Title|Date|Time (optional)|Date (if different day)|date and time|Place|Note (optional)|Reminder|Custom event type|Custom|My events|30 minutes before|1 hour before|2 hours before|1 day before|{n} attached — maximum|Add another ticket|Add document / ticket|Attached: {n}|tap a photo to open it|You can attach several photos, such as two tickets|Ticket {n}|Remove photo|Delete event|Only photos or screenshots can be attached|You can attach up to {n} photos|Could not open image|Event deleted|New event type|Custom type|For example: Concert|Icon|Replace image|Custom icon or photo|Color|Create|Delete type|Choose an image or photo|Enter a title|Choose a date|End time is before start time|Event exceeds 90 days — check the dates|Not enough storage: try a smaller image|Saved|Event added|Check-in|Check-out|Departure|Arrival|End|day|of',
    de:'Titel|Datum|Uhrzeit (optional)|Datum (falls anderer Tag)|Datum und Uhrzeit|Ort|Notiz (optional)|Erinnerung|Eigener Ereignistyp|Eigener|Meine Ereignisse|30 Minuten vorher|1 Stunde vorher|2 Stunden vorher|1 Tag vorher|{n} angehängt — Maximum|Weiteres Ticket hinzufügen|Dokument / Ticket hinzufügen|Angehängt: {n}|Foto zum Öffnen antippen|Mehrere Fotos möglich, zum Beispiel zwei Tickets|Ticket {n}|Foto entfernen|Ereignis löschen|Nur Fotos oder Screenshots können angehängt werden|Höchstens {n} Fotos möglich|Bild konnte nicht geöffnet werden|Ereignis gelöscht|Neuer Ereignistyp|Eigener Typ|Zum Beispiel: Konzert|Symbol|Eigenes Bild ersetzen|Eigenes Symbol oder Foto|Farbe|Erstellen|Typ löschen|Bild oder Foto auswählen|Titel eingeben|Datum auswählen|Endzeit liegt vor der Startzeit|Ereignis länger als 90 Tage — Daten prüfen|Nicht genug Speicher: kleineres Bild versuchen|Gespeichert|Ereignis hinzugefügt|Check-in|Check-out|Abflug|Ankunft|Ende|Tag|von',
    fr:'Titre|Date|Heure (facultatif)|Date (si autre jour)|date et heure|Lieu|Note (facultatif)|Rappel|Type personnalisé|Personnalisé|Mes événements|30 minutes avant|1 heure avant|2 heures avant|1 jour avant|{n} fichiers joints — maximum|Ajouter un autre billet|Ajouter un document / billet|Joints : {n}|touchez une photo pour l’ouvrir|Plusieurs photos possibles, par exemple deux billets|Billet {n}|Supprimer la photo|Supprimer l’événement|Seules les photos et captures d’écran sont acceptées|Maximum {n} photos|Impossible d’ouvrir l’image|Événement supprimé|Nouveau type d’événement|Type personnalisé|Par exemple : Concert|Icône|Remplacer l’image|Icône ou photo personnalisée|Couleur|Créer|Supprimer le type|Choisissez une image ou une photo|Saisissez un titre|Choisissez une date|L’heure de fin précède le début|L’événement dépasse 90 jours — vérifiez les dates|Stockage insuffisant : essayez une image plus petite|Enregistré|Événement ajouté|Arrivée|Départ|Départ du vol|Arrivée du vol|Fin|jour|sur',
    it:'Titolo|Data|Ora (facoltativa)|Data (se giorno diverso)|data e ora|Luogo|Nota (facoltativa)|Promemoria|Tipo personalizzato|Personalizzato|I miei eventi|30 minuti prima|1 ora prima|2 ore prima|1 giorno prima|{n} allegati — massimo|Aggiungi un altro biglietto|Aggiungi documento / biglietto|Allegati: {n}|tocca una foto per aprirla|Puoi allegare più foto, per esempio due biglietti|Biglietto {n}|Rimuovi foto|Elimina evento|Puoi allegare solo foto o schermate|Massimo {n} foto|Impossibile aprire l’immagine|Evento eliminato|Nuovo tipo di evento|Tipo personalizzato|Per esempio: Concerto|Icona|Sostituisci immagine|Icona o foto personalizzata|Colore|Crea|Elimina tipo|Scegli un’immagine o una foto|Inserisci un titolo|Scegli una data|L’ora di fine precede quella di inizio|L’evento supera 90 giorni — controlla le date|Spazio insufficiente: prova un’immagine più piccola|Salvato|Evento aggiunto|Check-in|Check-out|Partenza|Arrivo|Fine|giorno|di',
    es:'Título|Fecha|Hora (opcional)|Fecha (si es otro día)|fecha y hora|Lugar|Nota (opcional)|Recordatorio|Tipo personalizado|Personalizado|Mis eventos|30 minutos antes|1 hora antes|2 horas antes|1 día antes|{n} adjuntos — máximo|Añadir otra entrada|Añadir documento / entrada|Adjuntos: {n}|toca una foto para abrirla|Puedes adjuntar varias fotos, por ejemplo dos entradas|Entrada {n}|Quitar foto|Eliminar evento|Solo se pueden adjuntar fotos o capturas|Máximo {n} fotos|No se pudo abrir la imagen|Evento eliminado|Nuevo tipo de evento|Tipo personalizado|Por ejemplo: Concierto|Icono|Cambiar imagen|Icono o foto personalizada|Color|Crear|Eliminar tipo|Elige una imagen o foto|Escribe un título|Elige una fecha|La hora de fin es anterior al inicio|El evento supera 90 días: revisa las fechas|Sin espacio suficiente: prueba una imagen más pequeña|Guardado|Evento añadido|Entrada|Salida|Salida del vuelo|Llegada del vuelo|Fin|día|de',
    pt:'Título|Data|Hora (opcional)|Data (se for outro dia)|data e hora|Local|Nota (opcional)|Lembrete|Tipo personalizado|Personalizado|Os meus eventos|30 minutos antes|1 hora antes|2 horas antes|1 dia antes|{n} anexos — máximo|Adicionar outro bilhete|Adicionar documento / bilhete|Anexos: {n}|toque numa foto para abrir|Pode anexar várias fotos, por exemplo dois bilhetes|Bilhete {n}|Remover foto|Eliminar evento|Só pode anexar fotos ou capturas de ecrã|Máximo de {n} fotos|Não foi possível abrir a imagem|Evento eliminado|Novo tipo de evento|Tipo personalizado|Por exemplo: Concerto|Ícone|Substituir imagem|Ícone ou foto personalizada|Cor|Criar|Eliminar tipo|Escolha uma imagem ou foto|Introduza um título|Escolha uma data|A hora de fim é anterior à de início|O evento ultrapassa 90 dias — verifique as datas|Espaço insuficiente: tente uma imagem menor|Guardado|Evento adicionado|Entrada|Saída|Partida|Chegada|Fim|dia|de',
    pl:'Tytuł|Data|Godzina (opcjonalnie)|Data (jeśli inny dzień)|data i godzina|Miejsce|Notatka (opcjonalnie)|Przypomnienie|Własny typ wydarzenia|Własny|Moje wydarzenia|30 minut wcześniej|1 godzinę wcześniej|2 godziny wcześniej|1 dzień wcześniej|Dodano {n} — limit|Dodaj kolejny bilet|Dodaj dokument / bilet|Dodano: {n}|dotknij zdjęcia, aby je otworzyć|Można dodać kilka zdjęć, np. dwa bilety|Bilet {n}|Usuń zdjęcie|Usuń wydarzenie|Można dodać tylko zdjęcia lub zrzuty ekranu|Maksymalnie {n} zdjęcia|Nie udało się otworzyć obrazu|Wydarzenie usunięte|Nowy typ wydarzenia|Własny typ|Na przykład: Koncert|Ikona|Zmień obraz|Własna ikona lub zdjęcie|Kolor|Utwórz|Usuń typ|Wybierz obraz lub zdjęcie|Wpisz tytuł|Wybierz datę|Godzina końca jest przed początkiem|Wydarzenie trwa ponad 90 dni — sprawdź daty|Za mało miejsca: użyj mniejszego obrazu|Zapisano|Dodano wydarzenie|Zameldowanie|Wymeldowanie|Wylot|Przylot|Koniec|dzień|z',
    el:'Τίτλος|Ημερομηνία|Ώρα (προαιρετικά)|Ημερομηνία (αν άλλη ημέρα)|ημερομηνία και ώρα|Τοποθεσία|Σημείωση (προαιρετικά)|Υπενθύμιση|Προσαρμοσμένος τύπος|Προσαρμοσμένο|Τα συμβάντα μου|30 λεπτά πριν|1 ώρα πριν|2 ώρες πριν|1 ημέρα πριν|{n} συνημμένα — μέγιστο|Προσθήκη άλλου εισιτηρίου|Προσθήκη εγγράφου / εισιτηρίου|Συνημμένα: {n}|πατήστε τη φωτογραφία για άνοιγμα|Μπορείτε να προσθέσετε πολλές φωτογραφίες|Εισιτήριο {n}|Αφαίρεση φωτογραφίας|Διαγραφή συμβάντος|Μόνο φωτογραφίες ή στιγμιότυπα μπορούν να επισυναφθούν|Έως {n} φωτογραφίες|Δεν ήταν δυνατό το άνοιγμα της εικόνας|Το συμβάν διαγράφηκε|Νέος τύπος συμβάντος|Προσαρμοσμένος τύπος|Για παράδειγμα: Συναυλία|Εικονίδιο|Αντικατάσταση εικόνας|Δικό σας εικονίδιο ή φωτογραφία|Χρώμα|Δημιουργία|Διαγραφή τύπου|Επιλέξτε εικόνα ή φωτογραφία|Εισαγάγετε τίτλο|Επιλέξτε ημερομηνία|Η ώρα λήξης προηγείται της έναρξης|Το συμβάν υπερβαίνει τις 90 ημέρες — ελέγξτε τις ημερομηνίες|Ανεπαρκής χώρος: δοκιμάστε μικρότερη εικόνα|Αποθηκεύτηκε|Το συμβάν προστέθηκε|Άφιξη|Αναχώρηση|Αναχώρηση πτήσης|Άφιξη πτήσης|Λήξη|ημέρα|από',
    tr:'Başlık|Tarih|Saat (isteğe bağlı)|Tarih (farklı günse)|tarih ve saat|Yer|Not (isteğe bağlı)|Hatırlatıcı|Özel etkinlik türü|Özel|Etkinliklerim|30 dakika önce|1 saat önce|2 saat önce|1 gün önce|{n} ekli — en fazla|Başka bilet ekle|Belge / bilet ekle|Ekli: {n}|açmak için fotoğrafa dokunun|Birden fazla fotoğraf ekleyebilirsiniz|Bilet {n}|Fotoğrafı kaldır|Etkinliği sil|Yalnızca fotoğraf veya ekran görüntüsü eklenebilir|En fazla {n} fotoğraf|Görsel açılamadı|Etkinlik silindi|Yeni etkinlik türü|Özel tür|Örneğin: Konser|Simge|Görseli değiştir|Özel simge veya fotoğraf|Renk|Oluştur|Türü sil|Görsel veya fotoğraf seçin|Başlık girin|Tarih seçin|Bitiş saati başlangıçtan önce|Etkinlik 90 günü aşıyor — tarihleri kontrol edin|Yeterli alan yok: daha küçük görsel deneyin|Kaydedildi|Etkinlik eklendi|Giriş|Çıkış|Kalkış|Varış|Bitiş|gün|/’den'
  };
  const f = (key, n) => ((FORM_TEXT[calLocale()] || FORM_TEXT.en).split('|')[FORM_KEYS.indexOf(key)] || key).replaceAll('{n}', n ?? '');
  const BOOK_KEYS = ['bookingCode','flightFrom','arrivalAt','checkInAt','checkOutAt','accommodation','carPickup','carReturn','typeEnd','deleteTypeConfirm','typeEventsChange'];
  const BOOK_TEXT = {
    ru:'Бронирование|Вылет|Прилёт в|Заселение|Выезд|жильё|Получение авто|Возврат авто|конец|Удалить тип|В {n} событиях он сменится на «Другое».',
    en:'Booking|Departure|Arrival in|Check-in|Check-out|accommodation|Car pickup|Car return|end|Delete type|In {n} events it will change to “Other”.',
    de:'Buchung|Abflug|Ankunft in|Check-in|Check-out|Unterkunft|Auto abholen|Auto zurückgeben|Ende|Typ löschen|Bei {n} Ereignissen wird der Typ zu „Sonstiges“ geändert.',
    fr:'Réservation|Départ|Arrivée à|Arrivée|Départ|hébergement|Prise en charge du véhicule|Retour du véhicule|fin|Supprimer le type|Dans {n} événements, il deviendra « Autre ».',
    it:'Prenotazione|Partenza|Arrivo a|Check-in|Check-out|alloggio|Ritiro auto|Riconsegna auto|fine|Elimina tipo|In {n} eventi diventerà «Altro».',
    es:'Reserva|Salida|Llegada a|Entrada|Salida|alojamiento|Recogida del coche|Devolución del coche|fin|Eliminar tipo|En {n} eventos cambiará a «Otro».',
    pt:'Reserva|Partida|Chegada a|Entrada|Saída|alojamento|Recolha do carro|Devolução do carro|fim|Eliminar tipo|Em {n} eventos passará a «Outro».',
    pl:'Rezerwacja|Wylot|Przylot do|Zameldowanie|Wymeldowanie|nocleg|Odbiór auta|Zwrot auta|koniec|Usuń typ|W {n} wydarzeniach typ zmieni się na „Inne”.',
    el:'Κράτηση|Αναχώρηση|Άφιξη σε|Άφιξη|Αναχώρηση|κατάλυμα|Παραλαβή αυτοκινήτου|Επιστροφή αυτοκινήτου|τέλος|Διαγραφή τύπου|Σε {n} συμβάντα θα αλλάξει σε «Άλλο».',
    tr:'Rezervasyon|Kalkış|Varış|Giriş|Çıkış|konaklama|Araç teslim alma|Araç iadesi|bitiş|Türü sil|{n} etkinlikte tür “Diğer” olarak değişecek.'
  };
  const bText = (key, n) => ((BOOK_TEXT[calLocale()] || BOOK_TEXT.en).split('|')[BOOK_KEYS.indexOf(key)] || key).replaceAll('{n}', n ?? '');
  const dateLocale = () => ({en:'en-GB',pt:'pt-PT',el:'el-GR',tr:'tr-TR'}[calLocale()] || calLocale());

  // ---------- Даты ----------
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const mondayOf = s => { const d = parse(s); const wd = (d.getDay() + 6) % 7; return addDays(s, -wd); };
  const monthName = (d, style='long') => new Intl.DateTimeFormat(dateLocale(), {month:style}).format(d);
  const weekdayNames = () => Array.from({length:7},(_,i)=>new Intl.DateTimeFormat(dateLocale(),{weekday:'short'}).format(new Date(2024,0,1+i)));
  const fullDate = s => new Intl.DateTimeFormat(dateLocale(), {day:'numeric',month:'long',year:'numeric'}).format(parse(s));
  function rangeLabel(a, b) {
    const A = parse(a), B = parse(b);
    const short = d => new Intl.DateTimeFormat(dateLocale(),{day:'numeric',month:'long'}).format(d);
    if (A.getMonth() === B.getMonth()) return A.getDate() + ' – ' + short(B);
    return short(A) + ' – ' + short(B);
  }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ---------- Типы событий и виды для точек в календаре ----------
  // kind: event (синяя точка) · booking (оранжевая) · note (зелёная)
  const TYPES = [
    { id: 'flight', name: 'Перелёт', icon: 'plane', color: '#6C4CF0', bg: '#EEE8FF', kind: 'booking' },
    { id: 'stay', name: 'Проживание', icon: 'bed-double', color: '#7556F0', bg: '#EEE8FF', kind: 'booking' },
    { id: 'transport', name: 'Транспорт', icon: 'car', color: '#1FA55A', bg: '#E1F6E7', kind: 'event' },
    { id: 'arrival', name: 'Прилёт', icon: 'plane-landing', color: '#2B8AE8', bg: '#E2F0FF', kind: 'booking', hidden: true }, // из «Бронирований»
    { id: 'food', name: 'Еда', icon: 'utensils', color: '#EE8417', bg: '#FFF0DB', kind: 'event' },
    { id: 'ticket', name: 'Билеты', icon: 'ticket', color: '#6C4CF0', bg: '#EEEBFF', kind: 'booking', hidden: true }, // из «Бронирований»
    { id: 'other', name: 'Другое', icon: 'star', color: '#F2A516', bg: '#FFF6D6', kind: 'note' }
  ];
  // ---------- Свои типы событий (пользователь создаёт сам) ----------
  // Общие для всех поездок на этом устройстве: { id, name, icon | img, color, kind:'note' }
  const ICON_SET = ['star', 'ticket', 'camera', 'landmark', 'mountain', 'waves', 'tree-palm', 'music', 'party-popper', 'shopping-bag',
    'coffee', 'wine', 'dumbbell', 'bike', 'ship', 'train-front', 'church', 'footprints', 'heart', 'gift', 'briefcase', 'baby', 'sun', 'sparkles'];
  const COLORS = ['#6C4CF0', '#2E7BE6', '#0FA3B1', '#1FA55A', '#F2A516', '#EE8417', '#E5484D', '#D63BA0'];
  const CT_KEY = 'st_mod_calendar_types';
  let CUSTOM = (() => { try { return JSON.parse(localStorage.getItem(CT_KEY)) || []; } catch (_) { return []; } })();
  const saveCustom = () => { try { localStorage.setItem(CT_KEY, JSON.stringify(CUSTOM)); return true; } catch (_) { return false; } };
  const allTypes = () => TYPES.concat(CUSTOM);
  const tIcon = t => t.img ? `<img src="${t.img}" alt="">` : `<i data-lucide="${t.icon}"></i>`;
  const tBg = t => t.bg || t.color + '22';
  const KINDS = { event: { name: 'Событие', color: '#2E7BE6' }, booking: { name: 'Бронь', color: '#EE8417' }, note: { name: 'Заметка', color: '#34C759' } };
  const OLD_TYPE = { tour: 'other', meet: 'other' }; // перенос типов из прошлой версии
  const typeOf = id => allTypes().find(t => t.id === (OLD_TYPE[id] || id)) || TYPES[TYPES.length - 1];

  const TRIP_ART = `<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true"><defs>
    <linearGradient id="cl-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7EC8FF"/><stop offset="1" stop-color="#CDEBFF"/></linearGradient>
    <linearGradient id="cl-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2FB6D9"/><stop offset="1" stop-color="#1A8FC0"/></linearGradient></defs>
    <rect width="64" height="64" fill="url(#cl-sky)"/><circle cx="47" cy="17" r="7" fill="#FFE27A"/>
    <path d="M0 36c10-3 22-3 32 0s22 3 32 0v28H0z" fill="url(#cl-sea)"/><path d="M0 50c14-5 30-6 44-3 8 2 14 2 20 1v16H0z" fill="#F6D9A1"/>
    <path d="M18 50c1-9 3-17 7-24" stroke="#8A5A2B" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M25 26c-5-4-12-3-15 1 5-1 9 0 15-1zM25 26c2-6 9-8 14-6-5 1-9 3-14 6zM25 26c5-3 12-2 15 3-5-2-9-2-15-3zM25 26c-2-5-1-11 4-13-2 4-3 8-4 13z" fill="#2E9E58"/></svg>`;

  // Свайп влево/вправо (палец или мышь)
  function onSwipe(el, onLeft, onRight) {
    if (!el) return;
    let x0 = null, y0 = null;
    el.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; });
    el.addEventListener('pointerup', e => {
      if (x0 === null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { el._swiped = Date.now(); (dx < 0 ? onLeft : onRight)(); }
    });
    el.addEventListener('pointercancel', () => { x0 = null; });
    // после свайпа не считать отпускание пальца нажатием на день
    el.addEventListener('click', e => { if (Date.now() - (el._swiped || 0) < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  STHub.addStyles('calendar', `
    [data-module="calendar"]{--cal-band:#E7E1FF;--cal-soft:#F3F0FF}
    [data-theme=dark] [data-module="calendar"]{--cal-band:rgba(124,108,255,.22);--cal-soft:rgba(255,255,255,.05)}
    [data-module="calendar"] .hub-title-row .hub-icbtn{background:none;border:0;box-shadow:none}
    [data-module="calendar"] .hub-title-row h2{font-size:1.12rem}
    [data-module="calendar"] #mod-action.cal-save{background:linear-gradient(135deg,#8E80FF,#5B4BEA);color:#fff;border-radius:16px;box-shadow:0 6px 16px rgba(91,75,234,.3)}
    .cal-card{border-radius:18px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .cal-trip{display:flex;align-items:center;gap:14px;padding:12px;width:100%;text-align:left;color:var(--text);font:inherit;cursor:pointer}
    .cal-trip-art{width:64px;height:56px;border-radius:12px;overflow:hidden;flex-shrink:0}
    .cal-trip-name{font-weight:800;font-size:1.05rem}
    .cal-trip-sub{color:var(--t2);font-size:.82rem;margin-top:3px}
    .cal-trip-sub.need{color:var(--accent);font-weight:700}
    .cal-trip svg.cal-chev{width:20px;height:20px;color:var(--t2);margin-left:auto;flex-shrink:0}
    .cal-month{padding:12px 10px 14px;touch-action:pan-y;user-select:none}
    .cal-mhd{display:flex;align-items:center;justify-content:space-between;padding:0 4px 8px}
    .cal-mhd b{font-size:1.08rem}
    .cal-nav{width:36px;height:36px;border:0;background:none;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:12px}
    .cal-nav svg{width:20px;height:20px}
    .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);row-gap:6px}
    .cal-wd{text-align:center;font-size:.74rem;color:var(--t2);font-weight:600;padding-bottom:4px}
    .cal-cell{position:relative;height:46px;border:0;background:none;color:var(--text);font:inherit;cursor:pointer;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start}
    .cal-cell.out{color:var(--t3)}
    .cal-cell.trip::before{content:"";position:absolute;top:2px;height:34px;left:0;right:0;background:var(--cal-band)}
    .cal-cell.trip.ts::before,.cal-cell.trip.c0::before{left:3px;border-top-left-radius:17px;border-bottom-left-radius:17px}
    .cal-cell.trip.te::before,.cal-cell.trip.c6::before{right:3px;border-top-right-radius:17px;border-bottom-right-radius:17px}
    .cal-num{position:relative;z-index:1;width:34px;height:34px;margin-top:2px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:.92rem}
    .cal-cell.today .cal-num{color:var(--accent);font-weight:800}
    .cal-cell.sel .cal-num{background:linear-gradient(135deg,#8E80FF,#5B4BEA);color:#fff;box-shadow:0 4px 12px rgba(91,75,234,.35)}
    .cal-dots{position:relative;z-index:1;display:flex;gap:3px;height:6px;margin-top:3px}
    .cal-dots i{width:5px;height:5px;border-radius:50%;display:block}
    .cal-legend{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:2px 6px;font-size:.78rem;color:var(--text)}
    .cal-legend span{display:inline-flex;align-items:center;gap:6px}
    .cal-legend i{width:12px;height:12px;border-radius:50%;display:block}
    .cal-add{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;border:0;border-radius:16px;background:linear-gradient(135deg,#8E80FF,#5B4BEA);color:#fff;font:inherit;font-weight:700;font-size:.95rem;cursor:pointer;box-shadow:0 8px 20px rgba(91,75,234,.28)}
    .cal-add svg{width:19px;height:19px}
    .cal-week{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;touch-action:pan-y;user-select:none}
    .cal-wday{border:0;background:none;color:var(--text);font:inherit;cursor:pointer;padding:6px 0 8px;border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:4px}
    .cal-wday small{font-size:.74rem;color:var(--t2);font-weight:600}
    .cal-wday b{font-size:1rem;font-weight:700}
    .cal-wday.sel{background:linear-gradient(160deg,#8E80FF,#5B4BEA);color:#fff;box-shadow:0 6px 14px rgba(91,75,234,.3)}
    .cal-wday.sel small{color:rgba(255,255,255,.85)}
    .cal-wday.today:not(.sel) b{color:var(--accent)}
    .cal-wday .cal-dots{margin-top:0}
    .cal-tl{position:relative;display:flex;flex-direction:column;gap:12px;padding-left:72px;min-height:120px;touch-action:pan-y}
    .cal-tl::before{content:"";position:absolute;left:62px;top:4px;bottom:4px;width:2px;background:var(--cal-band);border-radius:2px}
    .cal-ev{position:relative;display:flex;align-items:center;gap:12px;padding:12px 12px 12px 12px;width:100%;text-align:left;color:var(--text);font:inherit;cursor:pointer}
    .cal-ev-time{position:absolute;left:-72px;width:56px;text-align:right;font-weight:800;font-size:.86rem;font-variant-numeric:tabular-nums;color:var(--text)}
    .cal-ev-time.none{color:var(--t3);font-weight:600;font-size:.72rem;line-height:1.1}
    .cal-ev-ic{width:44px;height:44px;border-radius:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .cal-ev-ic svg{width:22px;height:22px}
    .cal-ev-txt{flex:1;min-width:0}
    .cal-ev-ttl{display:block;font-weight:700;font-size:.95rem;overflow-wrap:anywhere}
    .cal-ev-sub{display:block;color:var(--t2);font-size:.78rem;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cal-ev-go{width:20px;height:20px;color:var(--t3);flex-shrink:0}
    .cal-ev-go.pin{color:var(--accent)}
    .cal-ev.past{opacity:.55}
    .cal-empty{padding:26px 16px;text-align:center;color:var(--t2);font-size:.88rem;line-height:1.45}
    .cal-fab{position:fixed;right:max(18px,calc(50% - 262px));bottom:calc(var(--sb) + 22px);width:58px;height:58px;border-radius:50%;border:0;background:linear-gradient(135deg,#8E80FF,#5B4BEA);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(91,75,234,.4);cursor:pointer;z-index:20}
    .cal-fab svg{width:26px;height:26px}
    .cal-types{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:2px 16px 4px}
    .cal-types::-webkit-scrollbar{display:none}
    .cal-type img{width:28px;height:28px;border-radius:8px;object-fit:cover}
    .cal-type.plus{border-style:dashed;color:var(--accent);box-shadow:none;background:transparent}
    .cal-ev-ic{overflow:hidden}
    .cal-ev-ic img{width:100%;height:100%;object-fit:cover}
    .cal-field>img{width:24px;height:24px;border-radius:7px;object-fit:cover;flex-shrink:0}
    .cal-icons{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
    .cal-icons button{aspect-ratio:1;border-radius:14px;border:1.5px solid var(--hub-card-b);background:var(--hub-card);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
    .cal-icons button svg{width:22px;height:22px}
    .cal-icons button.on{border-color:var(--accent);background:var(--cal-soft);color:var(--accent)}
    .cal-colors{display:flex;gap:10px;flex-wrap:wrap}
    .cal-colors button{width:32px;height:32px;border-radius:50%;border:3px solid transparent;cursor:pointer;padding:0;box-shadow:0 0 0 1px var(--hub-card-b)}
    .cal-colors button.on{border-color:var(--hub-card);box-shadow:0 0 0 2px var(--text)}
    .cal-ct-prev{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:16px;background:var(--hub-soft)}
    .cal-ct-prev .cal-ev-ic{width:48px;height:48px}
    .cal-type span{max-width:100%;padding:0 3px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.66rem}
    .cal-type{flex:0 0 calc((100% - 32px) / 5);min-width:70px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 2px 10px;border-radius:16px;border:1.5px solid var(--hub-card-b);background:var(--hub-card);color:var(--text);font:inherit;font-size:.68rem;font-weight:600;cursor:pointer;box-shadow:var(--hub-shadow)}
    .cal-type svg{width:24px;height:24px}
    .cal-type.on{border-color:var(--accent);background:var(--cal-soft);box-shadow:0 0 0 1px var(--accent) inset}
    .cal-field{display:flex;align-items:center;gap:12px;padding:0 14px;min-height:54px;border-radius:16px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow);position:relative}
    .cal-field>svg{width:20px;height:20px;color:var(--accent);flex-shrink:0}
    .cal-field input,.cal-field select{flex:1;min-width:0;border:0;background:transparent;color:var(--text);font:inherit;font-size:16px;outline:none;min-height:52px}
    .cal-field input::placeholder{color:var(--t3)}
    .cal-field .cal-fchev{width:18px;height:18px;color:var(--t3);flex-shrink:0}
    .cal-rem{display:flex;align-items:center;gap:12px;padding:12px 14px}
    .cal-rem>svg{width:20px;height:20px;color:var(--accent);flex-shrink:0}
    .cal-rem-txt{flex:1}
    .cal-rem-txt b{display:block;font-size:.92rem}
    .cal-rem-txt select{border:0;background:transparent;color:var(--t2);font:inherit;font-size:.86rem;padding:0;margin-top:2px;outline:none}
    .cal-switch{position:relative;width:52px;height:30px;flex-shrink:0}
    .cal-switch input{opacity:0;width:0;height:0}
    .cal-switch span{position:absolute;inset:0;border-radius:30px;background:var(--b2);transition:background .2s;cursor:pointer}
    .cal-switch span::after{content:"";position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s}
    .cal-switch input:checked+span{background:linear-gradient(135deg,#8E80FF,#5B4BEA)}
    .cal-switch input:checked+span::after{transform:translateX(22px)}
    .cal-doc{display:flex;align-items:center;gap:14px;padding:10px 12px;width:100%;color:var(--text);font:inherit;text-align:left;cursor:pointer}
    .cal-doc-ic{width:48px;height:44px;border-radius:12px;background:var(--cal-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden}
    .cal-doc-ic svg{width:22px;height:22px}
    .cal-doc-ic img{width:100%;height:100%;object-fit:cover}
    .cal-doc-txt{flex:1;font-size:.9rem;font-weight:600}
    .cal-del{color:#E5484D;border:0;background:none;font:inherit;font-weight:700;padding:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
    .cal-del svg{width:18px;height:18px}
    .cal-form{display:flex;flex-direction:column;gap:10px;text-align:left}
    .cal-filters{display:flex;gap:7px}
    .cal-filter{flex:1;min-width:0;padding:9px 5px;border:1px solid var(--hub-card-b);border-radius:12px;background:var(--hub-card);color:var(--text);font:inherit;font-size:.8rem;font-weight:700;cursor:pointer}
    .cal-filter.on{background:var(--accent);border-color:var(--accent);color:#fff}
    .cal-source{display:flex;align-items:center;gap:10px;font-size:.86rem;font-weight:700;color:var(--text)}
    .cal-source select{flex:1;min-width:0;padding:10px;border:1px solid var(--hub-card-b);border-radius:12px;background:var(--hub-card);color:var(--text);font:inherit}
    .cal-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
    .cal-2>div{min-width:0;display:flex;flex-direction:column;gap:6px}
    .cal-2 .cal-field{padding:0 10px;gap:8px}
    .cal-field input[type=date],.cal-field input[type=time]{width:100%;font-size:15px}
    .cal-form label{font-size:.78rem;font-weight:700;color:var(--t2)}
    /* ===== вид по макету (Figma) ===== */
    [data-module="calendar"] .mod-body{display:flex;flex-direction:column;gap:14px}
    .cal-trip{padding:12px 18px 12px 12px;border-radius:22px;gap:16px}
    .cal-trip-art{width:94px;height:72px;border-radius:14px}
    .cal-trip-art img{width:100%;height:100%;object-fit:cover;display:block}
    .cal-trip-name{font-size:1.28rem;letter-spacing:-.01em}
    .cal-trip-sub{font-size:.95rem;margin-top:5px}
    .cal-trip svg.cal-chev{width:24px;height:24px;color:var(--text)}
    .cal-mbar{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:22px;margin-top:4px}
    .cal-mbar b{font-size:1.3rem;font-weight:800;letter-spacing:-.01em}
    .cal-mbar .cal-nav{width:40px;height:40px}
    .cal-mbar .cal-nav svg{width:22px;height:22px}
    .cal-month2{touch-action:pan-y;user-select:none;padding:0 2px}
    .cal-month2 .cal-grid{row-gap:4px}
    .cal-month2 .cal-wd{font-size:.86rem;font-weight:600;color:var(--t2);padding:4px 0 10px}
    .cal-month2 .cal-cell{height:58px}
    .cal-month2 .cal-cell.trip::before{top:3px;height:44px}
    .cal-month2 .cal-cell.trip.ts::before,.cal-month2 .cal-cell.trip.c0::before{left:2px;border-radius:22px 0 0 22px}
    .cal-month2 .cal-cell.trip.te::before,.cal-month2 .cal-cell.trip.c6::before{right:2px;border-radius:0 22px 22px 0}
    .cal-month2 .cal-cell.trip.ts.te::before,.cal-month2 .cal-cell.trip.ts.c6::before,.cal-month2 .cal-cell.trip.c0.te::before{border-radius:22px}
    .cal-month2 .cal-num{width:44px;height:44px;margin-top:3px;font-size:1.08rem;font-weight:600}
    .cal-month2 .cal-cell.out .cal-num{color:var(--t3)}
    .cal-month2 .cal-dots{margin-top:2px;gap:4px}
    .cal-month2 .cal-dots i{width:6px;height:6px}
    .cal-legend{justify-content:space-between;padding:6px 4px 2px;font-size:.9rem;font-weight:500}
    .cal-legend i{width:14px;height:14px}
    .cal-add{min-height:62px;border-radius:20px;font-size:1.1rem;font-weight:700;margin-top:10px;background:linear-gradient(100deg,#8B7BFF,#5E44EE);box-shadow:0 12px 26px rgba(94,68,238,.32)}
    .cal-add svg{width:24px;height:24px}
    /* страница дня */
    .cal-week2{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;touch-action:pan-y;user-select:none;margin:2px -4px 6px}
    .cal-week2 .cal-wday{padding:10px 0 9px;border-radius:16px;gap:8px}
    .cal-week2 .cal-wday small{font-size:.9rem;font-weight:500;color:var(--t2)}
    .cal-week2 .cal-wday b{font-size:1.15rem;font-weight:600}
    .cal-week2 .cal-wday.sel{background:linear-gradient(170deg,#8E7DFF,#5B40EA);box-shadow:0 8px 18px rgba(91,64,234,.32)}
    .cal-week2 .cal-wday.sel small,.cal-week2 .cal-wday.sel b{color:#fff}
    .cal-week2 .cal-dots{min-height:7px}
    .cal-week2 .cal-dots i{width:7px;height:7px}
    .cal-week2 .cal-wday.sel .cal-dots i{box-shadow:0 0 0 1.5px #fff}
    .cal-tl{padding-left:78px;gap:14px}
    .cal-tl::before{left:72px;width:1.5px;background:var(--hub-card-b)}
    .cal-ev{padding:14px 16px 14px 14px;border-radius:20px;gap:16px;min-height:84px}
    .cal-ev-time{left:-80px;width:60px;font-size:1.02rem;font-weight:700;text-align:left}
    .cal-ev-ic{width:54px;height:54px;border-radius:15px}
    .cal-ev-ic svg{width:27px;height:27px;stroke-width:2.1}
    .cal-ev-ttl{font-size:1.02rem;font-weight:800}
    .cal-ev-sub{font-size:.88rem;margin-top:5px}
    .cal-ev-go{width:22px;height:22px;color:var(--text)}
    .cal-ev-go.pin{color:#6C4CF0}
    .cal-fab{width:66px;height:66px;background:linear-gradient(140deg,#8E7DFF,#5B40EA)}
    .cal-fab svg{width:30px;height:30px}
    /* форма */
    .cal-types{gap:10px}
    .cal-type{flex:0 0 calc((100% - 40px) / 5);min-width:76px;min-height:92px;justify-content:center;border-radius:18px;gap:10px}
    .cal-type svg{width:28px;height:28px;stroke-width:2.2}
    .cal-type span{font-size:.74rem;font-weight:600}
    .cal-type.on{border-width:2px}
    .cal-row{position:relative;display:flex;align-items:center;gap:18px;padding:0 18px;min-height:58px;border-radius:18px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow);cursor:pointer;color:var(--text)}
    .cal-row>svg:first-child,.cal-row>img:first-child{width:24px;height:24px;color:#6C4CF0;flex-shrink:0;stroke-width:2}
    .cal-row>img:first-child{border-radius:7px;object-fit:cover}
    .cal-row input:not(.cal-native){flex:1;min-width:0;border:0;background:transparent;color:var(--text);font:inherit;font-size:1.05rem;outline:none;min-height:56px}
    .cal-row input::placeholder{color:var(--t2)}
    .cal-row.in{cursor:text}
    .cal-docs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
    .cal-docs>div{position:relative;aspect-ratio:3/4;border-radius:12px;overflow:hidden;background:var(--cal-soft);cursor:pointer}
    .cal-docs img{width:100%;height:100%;object-fit:cover;display:block}
    .cal-docs button{position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
    .cal-docs button svg{width:15px;height:15px}
    .cal-row-v{flex:1;font-size:1.05rem}
    .cal-row-v.ph{color:var(--t2)}
    .cal-row .cal-fchev{width:22px;height:22px;color:var(--text);flex-shrink:0}
    .cal-native{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:0;padding:0;margin:0}
    .cal-row.sub{min-height:50px;box-shadow:none;background:transparent;border-style:dashed;color:#6C4CF0;font-weight:700;justify-content:center;gap:8px}
    .cal-row.sub svg{width:20px;height:20px}
    .cal-endlbl{font-size:.8rem;font-weight:700;color:var(--t2);margin:4px 4px -4px}
    .cal-rem{padding:16px 18px;gap:18px;border-radius:20px}
    .cal-rem>svg{width:24px;height:24px}
    .cal-rem-txt b{font-size:1.02rem}
    .cal-rem-txt select{font-size:1rem;color:var(--text);margin-top:4px}
    .cal-switch{width:62px;height:36px}
    .cal-switch span::after{width:30px;height:30px}
    .cal-switch input:checked+span::after{transform:translateX(26px)}
    .cal-doc{padding:14px 16px;border-radius:20px;gap:18px}
    .cal-doc-ic{width:62px;height:52px;border-radius:15px}
    .cal-doc-ic svg{width:28px;height:28px}
    .cal-doc-txt{font-size:1.02rem;font-weight:500}
    .cal-trip-art{width:86px;height:66px}
    .cal-trip-sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cal-trip>div:nth-child(2){min-width:0;flex:1}
    .cal-tl{padding-left:66px}
    .cal-tl::before{left:60px}
    .cal-ev-time{left:-66px;width:54px}
    .cal-ev{gap:14px;padding:14px 14px 14px 12px}
    .cal-ev-ic{width:50px;height:50px}
    .cal-ev-ttl{font-size:.98rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;overflow-wrap:normal}
    .cal-ev.past{opacity:.72}
    .cal-types{gap:8px}
    .cal-type{flex:0 0 calc((100% - 32px) / 5);min-width:0;min-height:88px;gap:9px}
    .cal-type span{font-size:.6rem;letter-spacing:-.02em;padding:0 1px;text-overflow:clip}
    .cal-trip-art{width:80px;height:62px}
    .cal-trip-sub{font-size:.86rem}
    .cal-type svg,.cal-type img{width:27px;height:27px}
    .cal-wx{display:flex;align-items:center;gap:12px;padding:12px 16px;width:100%;font:inherit;color:var(--text);text-align:left;cursor:pointer;border-radius:18px;margin-bottom:2px}
    .cal-wx>svg:first-child{width:22px;height:22px;color:#F2A516;flex-shrink:0}
    .cal-wx span{flex:1;font-weight:600;font-size:.95rem}
    [data-theme=dark] .cal-row>svg:first-child,[data-theme=dark] .cal-ev-go.pin{color:#A898FF}
    [data-theme=dark] .cal-ev-ic,[data-theme=dark] .cal-type svg{filter:saturate(1.15)}
    [data-theme=dark] .cal-ev-ic{background:rgba(255,255,255,.08)!important}
  `);

  function sheet(title, html, bind) {
    document.getElementById('cal-sheet')?.remove();
    const ov = document.createElement('div');
    ov.className = 'ov open'; ov.id = 'cal-sheet';
    ov.innerHTML = `<div class="mdl"><div class="mdl-handle"></div><div class="mdl-title">${esc(title)}</div>${html}</div>`;
    const close = () => { ov.remove(); document.body.style.overflow = ''; };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    // внутрь экрана модуля, чтобы работали цвета и стили плиток
    (document.getElementById('pg-module') || document.body).appendChild(ov);
    document.body.style.overflow = 'hidden';
    if (typeof initializeIcons === 'function') initializeIcons(ov);
    bind(ov.firstChild, close);
  }

  STHub.registerService('calendar', ctx => {
    const store = ctx.store;
    let dates = ctx.trip ? store.get('dates', null) : null; // даты относятся только к поездке
    let events = ctx.trip ? store.get('events', []).map(e => Object.assign({}, e, { type: typeOf(e.type).id })) : [];
    let personalEvents = (window.STKey?.calendarEvents?.() || []).map(e => Object.assign({}, e, { type: typeOf(e.type).id }));
    let scope = ctx.trip ? store.get('scope', 'all') : 'personal';
    const saveDates = () => store.set('dates', dates);
    const saveEvents = () => store.set('events', events);
    const savePersonalEvents = () => window.STKey?.setCalendarEvents?.(personalEvents);
    const filtersHtml = () => ctx.trip ? `<div class="cal-filters">${[['trip',c('trip')],['personal',c('mine')],['all',c('all')]].map(([id,name]) => `<button class="cal-filter${scope === id ? ' on' : ''}" type="button" data-scope="${id}">${esc(name)}</button>`).join('')}</div>` : '';
    const bindFilters = (body, screen) => body.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click', () => { scope = b.dataset.scope; store.set('scope', scope); screen.refresh(); }));

    // выбранный день и показанный месяц
    let selected = dates && (today() < dates.start || today() > dates.end) ? dates.start : today();
    let month = selected.slice(0, 7); // 'YYYY-MM'

    // Событие может длиться несколько дней: date/time — начало, endDate/endTime — конец (необязательно)
    const endOf = e => e.endDate || e.date;
    const timeOn = (e, d) => d === e.date ? (e.time || '') : (d === endOf(e) ? (e.endTime || '') : '');
    // Брони из модуля «Бронирования» сами появляются в календаре (только чтение)
    function bookingEvents() {
      if (!ctx.trip) return [];
      let list = [];
      try { list = JSON.parse(localStorage.getItem('st_mod_bookings_' + ctx.trip.id + '_items')) || []; } catch (_) {}
      const out = [];
      list.filter(b => b && b.date && b.status !== 'cancelled').forEach(b => {
        const ev = (suffix, o) => out.push(Object.assign({ id: 'bk_' + b.id + suffix, bookingId: b.id, booking: true, endDate: '', endTime: '', place: '', note: '' }, o));
        const end = b.endDate || b.date, hasEnd = !!(b.endDate || b.endTime);
        const code = b.code ? bText('bookingCode') + ' ' + b.code : '';
        if (b.cat === 'flight') {
          ev('_a', { type: 'flight', title: bText('flightFrom') + ' ' + (b.from || '') + ' → ' + (b.to || ''), date: b.date, time: b.time || '', sub: [b.provider, b.number].filter(Boolean).join(' · ') || code, place: [b.from, b.fromCity].filter(Boolean).join(' ') + ' airport' });
          if (b.endTime) ev('_b', { type: 'arrival', title: bText('arrivalAt') + ' ' + (b.toCity || b.to || ''), date: end, time: b.endTime, sub: b.toName || b.to || '' });
        } else if (b.cat === 'stay') {
          ev('_a', { type: 'stay', title: bText('checkInAt') + ' · ' + (b.title || bText('accommodation')), date: b.date, time: b.time || '', sub: b.place || code, place: b.place || '' });
          if (hasEnd && end !== b.date) ev('_b', { type: 'stay', title: bText('checkOutAt') + ' · ' + (b.title || bText('accommodation')), date: end, time: b.endTime || '', sub: b.place || code });
        } else if (b.cat === 'transport') {
          const car = /авто|машин|car|miet/i.test(b.title || '') || /sixt|europcar|hertz|avis|goldcar|enterprise/i.test(b.provider || '');
          ev('_a', { type: 'transport', title: car ? bText('carPickup') : (b.title || c('transport')), date: b.date, time: b.time || '', sub: [b.provider, code].filter(Boolean).join(' · ') || b.place || '', place: b.place || '' });
          if (hasEnd && end !== b.date) ev('_b', { type: 'transport', title: car ? bText('carReturn') : (b.title || c('transport')) + ' — ' + bText('typeEnd'), date: end, time: b.endTime || '', sub: [b.provider, b.placeTo || b.place].filter(Boolean).join(' · '), place: b.placeTo || b.place || '' });
        } else {
          ev('', { type: 'ticket', title: b.title || c('ticket'), date: b.date, time: b.time || '', endDate: b.endDate || '', endTime: b.endTime || '', sub: [b.place, b.people].filter(Boolean).join(' · '), place: b.place || '' });
        }
      });
      return out;
    }
    const allEvents = () => (scope === 'personal' ? [] : events.map(e => Object.assign({ source: 'trip' }, e)).concat(bookingEvents()))
      .concat(scope === 'trip' ? [] : personalEvents.map(e => Object.assign({ source: 'personal' }, e)));
    const byDay = d => allEvents().filter(e => e.date <= d && d <= endOf(e))
      .sort((a, b) => ((timeOn(a, d) || '00:00') + a.date).localeCompare((timeOn(b, d) || '00:00') + b.date));
    const nowKey = () => { const d = new Date(); return iso(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    const isPast = e => (endOf(e) + ' ' + ((e.endDate ? e.endTime : (e.endTime || e.time)) || '23:59')) < nowKey();
    // подписи начала и конца по типу события
    const SE = t => t.id === 'stay' ? [f('checkIn'), f('checkOut')] : t.id === 'flight' ? [f('departure'), f('landing')] : [c('start'), f('finish')];
    const inTrip = d => scope !== 'personal' && !!dates && d >= dates.start && d <= dates.end;
    const dots = d => {
      const kinds = [...new Set(byDay(d).map(e => typeOf(e.type).kind))].slice(0, 3);
      return `<span class="cal-dots">${kinds.map(k => `<i style="background:${KINDS[k].color}"></i>`).join('')}</span>`;
    };
    const shiftMonth = n => { const d = parse(month + '-01'); d.setMonth(d.getMonth() + n); month = iso(d).slice(0, 7); };

    function tripCard() {
      const t = ctx.trip || {};
      const n = ctx.members.length;
      const sub = dates ? rangeLabel(dates.start, dates.end) : c('setTripDates');
      return `<button class="cal-card cal-trip" type="button" data-a="dates">
        <div class="cal-trip-art"><img src="/img/trips/abstract.jpg" alt=""></div>
        <div><div class="cal-trip-name">${esc(t.name || c('trip'))}</div>
        <div class="cal-trip-sub${dates ? '' : ' need'}">${esc(sub)}${n ? ' · ' + n + ' ' + c(n===1?'member':'members') : ''}</div></div>
        <i data-lucide="chevron-down" class="cal-chev"></i></button>`;
    }

    // ===== Страница 1: месяц =====
    function openMonth() {
      ctx.openScreen({
        title: c('calendar'),
        action: { icon: 'more-vertical', label: c('more'), onClick: menu },
        render(body, screen) {
          const first = parse(month + '-01');
          const start = mondayOf(month + '-01');
          const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
          const weeks = Math.ceil((diffDays(start, iso(last)) + 1) / 7);
          const cells = [];
          for (let i = 0; i < weeks * 7; i++) {
            const d = addDays(start, i);
            const cls = ['cal-cell', 'c' + (i % 7)];
            if (d.slice(0, 7) !== month) cls.push('out');
            if (inTrip(d)) { cls.push('trip'); if (d === dates.start) cls.push('ts'); if (d === dates.end) cls.push('te'); }
            if (d === today()) cls.push('today');
            if (d === selected) cls.push('sel');
            cells.push(`<button class="${cls.join(' ')}" type="button" data-day="${d}"><span class="cal-num">${parse(d).getDate()}</span>${dots(d)}</button>`);
          }
          body.innerHTML = `
            ${ctx.trip ? tripCard() : ''}
            ${filtersHtml()}
            <div class="cal-card cal-mbar">
              <button class="cal-nav" type="button" data-m="-1" aria-label="${esc(c('prevMonth'))}"><i data-lucide="chevron-left"></i></button>
              <b>${esc(new Intl.DateTimeFormat(dateLocale(),{month:'long',year:'numeric'}).format(first))}</b>
              <button class="cal-nav" type="button" data-m="1" aria-label="${esc(c('nextMonth'))}"><i data-lucide="chevron-right"></i></button>
            </div>
            <div class="cal-month2" id="cal-month">
              <div class="cal-grid">${weekdayNames().map(w => `<div class="cal-wd">${esc(w)}</div>`).join('')}${cells.join('')}</div>
            </div>
            <div class="cal-legend">
              <span><i style="background:#C9BCFF"></i>${esc(c('trip'))}</span>
              ${Object.entries(KINDS).map(([id,k]) => `<span><i style="background:${k.color}"></i>${esc(c(id))}</span>`).join('')}
            </div>
            <button class="cal-add" type="button" data-a="add"><i data-lucide="plus"></i>${esc(c('addEvent'))}</button>
          `;
          body.querySelector('[data-a="dates"]')?.addEventListener('click', datesForm);
          bindFilters(body, screen);
          body.querySelector('[data-a="add"]').addEventListener('click', () => openForm(null, selected, openMonth));
          body.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { shiftMonth(+b.dataset.m); screen.refresh(); }));
          body.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
            selected = b.dataset.day; month = selected.slice(0, 7); openDay();
          }));
          onSwipe(body.querySelector('#cal-month'), () => { shiftMonth(1); screen.refresh(); }, () => { shiftMonth(-1); screen.refresh(); });
          if (ctx.trip && window.STPlacePhoto) STPlacePhoto.tripImg(body.querySelector('.cal-trip-art img'), ctx.trip, { width: 300 }); // фото места поездки
        }
      });
    }

    function menu() {
      sheet(c('calendar'), `<div class="cal-form" style="margin-top:10px">
          ${ctx.trip ? `<button class="st-btn st-btn-g st-btn-fw" data-a="dates"><i data-lucide="calendar-range"></i>${esc(c('tripDates'))}</button>` : ''}
          <button class="st-btn st-btn-g st-btn-fw" data-a="today"><i data-lucide="calendar-check"></i>${esc(c('today'))}</button>
          <button class="st-btn st-btn-g st-btn-fw" data-a="past" style="color:#E5484D"><i data-lucide="trash-2"></i>${esc(c('deletePast'))}</button>
        </div>`, (root, close) => {
        root.querySelector('[data-a="dates"]')?.addEventListener('click', () => { close(); datesForm(); });
        root.querySelector('[data-a="today"]').addEventListener('click', () => { selected = today(); month = selected.slice(0, 7); close(); openMonth(); });
        root.querySelector('[data-a="past"]').addEventListener('click', () => {
          const tripLeft = events.filter(e => !isPast(e));
          const personalLeft = personalEvents.filter(e => !isPast(e));
          const changed = (scope !== 'personal' && tripLeft.length !== events.length) || (scope !== 'trip' && personalLeft.length !== personalEvents.length);
          if (!changed) { ctx.toast(c('noPast')); return; }
          if (!confirm(c('confirmPast'))) return;
          if (scope !== 'personal') { events = tripLeft; saveEvents(); }
          if (scope !== 'trip') { personalEvents = personalLeft; savePersonalEvents(); }
          close(); openMonth();
        });
      });
    }

    function datesForm() {
      const s0 = dates ? dates.start : today(), e0 = dates ? dates.end : addDays(s0, 6);
      sheet(c('tripDates'), `<div class="cal-form">
          <div class="cal-2"><div><label>${esc(c('start'))}</label><input class="st-input" type="date" id="cal-s" value="${s0}"></div>
          <div><label>${esc(c('end'))}</label><input class="st-input" type="date" id="cal-e" value="${e0}"></div></div>
          <button class="st-btn st-btn-fw" data-a="ok">${esc(c('save'))}</button>
          ${dates ? `<button class="st-btn st-btn-g st-btn-fw" data-a="clear" style="color:#E5484D">${esc(c('clearDates'))}</button>` : ''}
        </div>`, (root, close) => {
        root.querySelector('[data-a="ok"]').addEventListener('click', () => {
          const s = root.querySelector('#cal-s').value, e = root.querySelector('#cal-e').value;
          if (!s || !e) { ctx.toast(c('bothDates')); return; }
          if (e < s) { ctx.toast(c('endBeforeStart')); return; }
          if (diffDays(s, e) > 90) { ctx.toast(c('tripTooLong')); return; }
          dates = { start: s, end: e }; saveDates(); selected = s; month = s.slice(0, 7); close(); openMonth();
        });
        root.querySelector('[data-a="clear"]')?.addEventListener('click', () => { dates = null; saveDates(); close(); openMonth(); });
      });
    }

    // Погода на выбранный день (сводка, которую сохраняет модуль «Погода»)
    function wxRow(d) {
      const ahead = diffDays(today(), d);
      if (!ctx.trip || ahead < 0 || ahead > 15) return '';
      let w = null;
      try { const s = JSON.parse(localStorage.getItem('st_wx_days_' + ctx.trip.id)); w = s && s.days && s.days[d] ? { city: s.city, v: s.days[d] } : null; } catch (_) {}
      const txt = w ? `${esc(w.city)}: ${Math.round(w.v[2])}° / ${Math.round(w.v[1])}°${w.v[3] >= 20 ? ' · ' + c('rain') + ' ' + w.v[3] + '%' : ''}` : c('weatherDay');
      return `<button class="cal-card cal-wx" type="button" data-a="wx"><i data-lucide="${w && w.v[0] >= 51 ? 'cloud-rain' : w && w.v[0] >= 2 ? 'cloud-sun' : 'sun'}"></i><span>${txt}</span><i data-lucide="chevron-right" class="cal-fchev"></i></button>`;
    }

    // ===== Страница 2: события недели =====
    function evRow(e, d) {
      const t = typeOf(e.type);
      const tm = timeOn(e, d);
      let sub = e.sub != null ? e.sub : ([e.place, e.note].filter(Boolean).join(' · ') || (TYPES.includes(t)?c(t.id):t.name));
      if (endOf(e) !== e.date && e.sub == null) { // несколько дней: «Заезд», «Выезд» или «день 2 из 4»
        const [s, endLabel] = SE(t), n = diffDays(e.date, endOf(e)) + 1;
        const tag = d === e.date ? s : d === endOf(e) ? endLabel : f('day') + ' ' + (diffDays(e.date, d) + 1) + ' ' + f('of') + ' ' + n;
        sub = tag + ' · ' + rangeLabel(e.date, endOf(e)) + (e.place ? ' · ' + e.place : '');
      } else if (e.time && e.endTime) sub = e.time + '–' + e.endTime + ' · ' + sub;
      const pin = !!e.place && !e.booking; // брони открываются по нажатию, свои события с местом — на карте
      const go = pin ? 'map-pin' : 'chevron-right';
      return `<button class="cal-card cal-ev${isPast(e) ? ' past' : ''}" type="button" data-ev="${e.id}">
        ${tm ? `<span class="cal-ev-time">${esc(tm)}</span>` : `<span class="cal-ev-time none">${esc(c('allDay'))}</span>`}
        <span class="cal-ev-ic" style="background:${tBg(t)};color:${t.color}">${tIcon(t)}</span>
        <span class="cal-ev-txt"><span class="cal-ev-ttl">${esc(e.title)}</span><span class="cal-ev-sub">${esc(sub)}</span></span>
        <i data-lucide="${go}" class="cal-ev-go${pin ? ' pin' : ''}"${pin ? ' data-map="1"' : ''}></i>
      </button>`;
    }

    function openDay() {
      ctx.openScreen({
        title: fullDate(selected),
        onBack: openMonth,
        action: { icon: 'more-vertical', label: c('more'), onClick: menu },
        render(body, screen) {
          const mon = mondayOf(selected);
          const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
          const list = byDay(selected);
          body.innerHTML = `
            ${filtersHtml()}
            <div class="cal-week2" id="cal-week">${days.map((d, i) => `
              <button class="cal-wday${d === selected ? ' sel' : ''}${d === today() ? ' today' : ''}" type="button" data-day="${d}">
                <small>${esc(weekdayNames()[i])}</small><b>${parse(d).getDate()}</b>${dots(d)}
              </button>`).join('')}
            </div>
            ${wxRow(selected)}
            <div class="cal-tl" id="cal-tl">
              ${list.length ? list.map(e => evRow(e, selected)).join('') : `<div class="cal-empty" style="margin-left:-72px">${esc(c('noEvents'))}</div>`}
            </div>
            <div style="height:90px"></div>
            <button class="cal-fab" type="button" aria-label="${esc(c('addEvent'))}"><i data-lucide="plus"></i></button>
          `;
          screen.setTitle(fullDate(selected));
          bindFilters(body, screen);
          const go = n => { selected = addDays(selected, n); month = selected.slice(0, 7); screen.refresh(); };
          body.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { selected = b.dataset.day; month = selected.slice(0, 7); screen.refresh(); }));
          onSwipe(body.querySelector('#cal-week'), () => go(7), () => go(-7));
          onSwipe(body.querySelector('#cal-tl'), () => go(1), () => go(-1));
          body.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', ev => {
            const e = allEvents().find(x => x.id === b.dataset.ev); if (!e) return;
            if (ev.target.closest('[data-map]')) { window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.place), '_blank'); return; }
            if (e.booking) { // бронь открываем в «Бронированиях»
              try { sessionStorage.setItem('st_bk_open', e.bookingId); } catch (_) {}
              STHub.openService('bookings'); return;
            }
            openForm(e, e.date, openDay);
          }));
          body.querySelector('.cal-fab').addEventListener('click', () => openForm(null, selected, openDay));
          body.querySelector('[data-a="wx"]')?.addEventListener('click', () => {
            try { sessionStorage.setItem('st_wx_date', selected); } catch (_) {}
            STHub.openService('weather');
          });
        }
      });
    }

    // Фото билета: уменьшаем до ~1200px, JPEG — чтобы не переполнить память телефона
    function compress(file, max = 1200, square = false) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onerror = reject;
        r.onload = () => {
          const img = new Image();
          img.onerror = reject;
          img.onload = () => {
            const c = document.createElement('canvas');
            if (square) { // квадрат по центру — для своей иконки
              const s = Math.min(img.width, img.height);
              c.width = c.height = max;
              c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, max, max);
              resolve(c.toDataURL('image/jpeg', 0.8)); return;
            }
            const k = Math.min(1, max / Math.max(img.width, img.height));
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.7));
          };
          img.src = r.result;
        };
        r.readAsDataURL(file);
      });
    }

    // ===== Страница 3: добавить / изменить событие =====
    const REMIND = [[0.5, 'minutes30'], [1, 'hour1'], [2, 'hours2'], [24, 'day1']];
    function openForm(ev, day, back) {
      const draft = ev ? Object.assign({}, ev, { type: typeOf(ev.type).id, docs: ev.docs ? ev.docs.slice() : ev.doc ? [ev.doc] : [] })
        : { id: uid(), title: '', date: day || selected, time: '', type: 'transport', endDate: '', endTime: '', place: '', note: '', remind: false, docs: [], source: ctx.trip && scope !== 'personal' ? 'trip' : 'personal' };
      delete draft.doc;
      const MAX_DOCS = 4; // фото хранятся на телефоне — больше 4 на событие не даём, чтобы не переполнить память
      const screen = ctx.openScreen({
        title: ev ? c('event') : c('addEvent'),
        onBack: back,
        action: { icon: 'check', label: c('save'), onClick: save },
        render(body) {
          const t = typeOf(draft.type);
          const [l1, l2] = SE(t);
          const showEnd = draft._end || draft.endDate || draft.endTime;
          const dateRow = (id, val, icon, ph) => `<label class="cal-row"><i data-lucide="${icon}"></i>
              <span class="cal-row-v${val ? '' : ' ph'}" id="${id}-v">${val ? esc(fullDate(val)) : ph}</span><i data-lucide="chevron-right" class="cal-fchev"></i>
              <input class="cal-native" type="date" id="${id}" value="${esc(val || '')}"></label>`;
          const timeRow = (id, val, ph) => `<label class="cal-row"><i data-lucide="clock"></i>
              <span class="cal-row-v${val ? '' : ' ph'}" id="${id}-v">${val ? esc(val) : ph}</span><i data-lucide="chevron-down" class="cal-fchev"></i>
              <input class="cal-native" type="time" id="${id}" value="${esc(val || '')}"></label>`;
          body.innerHTML = `
            <div class="cal-form" style="gap:12px">
              <div class="cal-types">${allTypes().filter(x => !x.hidden || x.id === draft.type).map(x => `
                <button class="cal-type${x.id === draft.type ? ' on' : ''}" type="button" data-type="${x.id}" style="color:${x.color}">
                  ${tIcon(x)}<span style="color:var(--text)">${esc(TYPES.includes(x) ? c(x.id) : x.name)}</span></button>`).join('')}
                <button class="cal-type plus" type="button" data-a="new-type" aria-label="${f('customType')}"><i data-lucide="plus"></i><span style="color:var(--text)">${f('custom')}</span></button>
              </div>
              <div class="cal-row in" style="margin-top:4px">${tIcon(t)}<input id="f-title" maxlength="80" placeholder="${f('title')}" value="${esc(draft.title)}"></div>
              ${ctx.trip ? `<label class="cal-source">${c('calendar')} <select id="f-source"><option value="trip"${draft.source !== 'personal' ? ' selected' : ''}>${c('trip')}</option><option value="personal"${draft.source === 'personal' ? ' selected' : ''}>${f('myEvents')}</option></select></label>` : ''}
              ${dateRow('f-date', draft.date, 'calendar', f('date'))}
              ${timeRow('f-time', draft.time, f('timeOptional'))}
              ${showEnd ? `<div class="cal-endlbl">${l2}</div>
                ${dateRow('f-edate', draft.endDate, 'calendar-check', f('dateIfOther'))}
                ${timeRow('f-etime', draft.endTime, f('timeOptional'))}`
                : `<button class="cal-row sub" type="button" data-a="end"><i data-lucide="plus"></i>${l2}: ${f('dateTime')}</button>`}
              <div class="cal-row in"><i data-lucide="map-pin"></i><input id="f-place" maxlength="120" placeholder="${f('place')}" value="${esc(draft.place)}"></div>
              <div class="cal-row in"><i data-lucide="file-text"></i><input id="f-note" maxlength="200" placeholder="${f('noteOptional')}" value="${esc(draft.note)}"></div>
              <div class="cal-card cal-rem" style="margin-top:4px">
                <i data-lucide="bell"></i>
                <div class="cal-rem-txt"><b>${f('reminder')}</b>
                  <select id="f-rem"${draft.remind ? '' : ' disabled'}>${REMIND.map(([h, key]) => `<option value="${h}"${+(draft.remind || 2) === h ? ' selected' : ''}>${f(key)}</option>`).join('')}</select></div>
                <label class="cal-switch"><input type="checkbox" id="f-rem-on"${draft.remind ? ' checked' : ''}><span></span></label>
              </div>
              <div class="cal-card" style="padding:10px 12px">
                <button class="cal-doc" type="button" id="f-doc" style="padding:0;border:0;background:none"${draft.docs.length >= MAX_DOCS ? ' disabled' : ''}>
                  <span class="cal-doc-ic"><i data-lucide="${draft.docs.length ? 'plus' : 'ticket'}"></i></span>
                  <span class="cal-doc-txt">${draft.docs.length >= MAX_DOCS ? f('attachMax', MAX_DOCS) : draft.docs.length ? f('addTicket') : f('addDocument')}<br><small style="color:var(--t2)">${draft.docs.length ? f('attached', draft.docs.length) + ' · ' + f('tapPhoto') : f('multiplePhotos')}</small></span>
                </button>
                ${draft.docs.length ? `<div class="cal-docs">${draft.docs.map((d, i) => `<div data-doc="${i}"><img src="${d}" alt="${f('photoTicket', i + 1)}"><button type="button" data-doc-x="${i}" aria-label="${f('removePhoto')}"><i data-lucide="x"></i></button></div>`).join('')}</div>` : ''}
              </div>
              <input type="file" id="f-file" accept="image/*" multiple hidden>
              ${ev ? `<button class="cal-del" type="button" id="f-del"><i data-lucide="trash-2"></i>${f('deleteEvent')}</button>` : ''}
              <div style="height:12px"></div>
            </div>`;
          document.getElementById('mod-action')?.classList.add('cal-save');
          body.querySelector('.cal-type.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });

          const read = () => {
            draft.title = body.querySelector('#f-title').value.trim();
            draft.source = body.querySelector('#f-source')?.value || 'personal';
            draft.date = body.querySelector('#f-date').value;
            draft.time = body.querySelector('#f-time').value;
            draft.endDate = body.querySelector('#f-edate')?.value || '';
            draft.endTime = body.querySelector('#f-etime')?.value || '';
            draft.place = body.querySelector('#f-place').value.trim();
            draft.note = body.querySelector('#f-note').value.trim();
            draft.remind = body.querySelector('#f-rem-on').checked ? +body.querySelector('#f-rem').value : false;
          };
          body.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
            read();
            const x = typeOf(b.dataset.type);
            // повторное нажатие на свой тип — изменить или удалить его
            if (x.id === draft.type && x.id.startsWith('c_')) { typeForm(x); return; }
            draft.type = x.id; screen.refresh();
          }));
          body.querySelector('[data-a="new-type"]').addEventListener('click', () => { read(); typeForm(null); });
          // строки даты и времени: нажатие открывает системный выбор, текст обновляется
          body.querySelectorAll('.cal-native').forEach(inp => {
            inp.addEventListener('click', () => { try { inp.showPicker && inp.showPicker(); } catch (_) {} });
            inp.addEventListener('change', () => {
              const v = body.querySelector('#' + inp.id + '-v');
              const ph = { 'f-date': f('date'), 'f-edate': f('dateIfOther') }[inp.id] || f('timeOptional');
              v.textContent = inp.value ? (inp.type === 'date' ? fullDate(inp.value) : inp.value) : ph;
              v.classList.toggle('ph', !inp.value);
              if (inp.id === 'f-date' && body.querySelector('#f-edate')) body.querySelector('#f-edate').min = inp.value;
            });
          });
          body.querySelector('[data-a="end"]')?.addEventListener('click', () => { read(); draft._end = true; screen.refresh(); });
          body.querySelector('#f-rem-on').addEventListener('change', e => { body.querySelector('#f-rem').disabled = !e.target.checked; });
          const file = body.querySelector('#f-file');
          body.querySelector('#f-doc').addEventListener('click', () => { if (draft.docs.length < MAX_DOCS) file.click(); });
          body.querySelectorAll('[data-doc]').forEach(el => el.addEventListener('click', e => {
            const x = e.target.closest('[data-doc-x]');
            if (x) { read(); draft.docs.splice(+x.dataset.docX, 1); screen.refresh(); return; }
            const src = draft.docs[+el.dataset.doc]; const w = window.open(); if (w) w.document.write(`<img src="${src}" style="max-width:100%">`);
          }));
          file.addEventListener('change', async () => {
            const files = [...file.files]; file.value = '';
            if (!files.length) return;
            const imgs = files.filter(f => f.type.startsWith('image/'));
            if (imgs.length < files.length) ctx.toast(f('onlyPhotos'));
            const free = MAX_DOCS - draft.docs.length;
            if (imgs.length > free) ctx.toast(f('maxPhotos', MAX_DOCS));
            read();
            for (const fileImage of imgs.slice(0, free)) { try { draft.docs.push(await compress(fileImage)); } catch (_) { ctx.toast(f('imageError')); } }
            screen.refresh();
          });
          // нажатие на иконку или пустое место строки — курсор в поле
          body.querySelectorAll('.cal-row.in').forEach(row => row.addEventListener('click', e => { if (e.target.tagName !== 'INPUT') row.querySelector('input')?.focus(); }));
          body.querySelector('#f-del')?.addEventListener('click', () => {
            if (!confirm(f('deleteEvent') + ' «' + draft.title + '»?')) return;
            if (draft.source === 'personal') { personalEvents = personalEvents.filter(x => x.id !== draft.id); savePersonalEvents(); }
            else { events = events.filter(x => x.id !== draft.id); saveEvents(); }
            ctx.toast(f('deleted')); back();
          });
          body._read = read;
        }
      });
      // Свой тип: название, иконка из набора или своя картинка/фото, цвет
      function typeForm(old) {
        const t = old ? Object.assign({}, old) : { id: 'c_' + uid(), name: '', icon: 'star', img: '', color: COLORS[0], kind: 'note' };
        const prev = () => `<span class="cal-ev-ic" style="background:${tBg(t)};color:${t.color}">${tIcon(t)}</span>
          <b style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(t.name) || `<span style="color:var(--t3);font-weight:600">${f('title')}</span>`}</b>`;
        sheet(old ? f('editType') : f('newType'), `<div class="cal-form" style="margin-top:10px">
            <div class="cal-ct-prev" id="cal-ct-prev">${prev()}</div>
            <label>${f('title')}</label>
            <input class="st-input" id="cal-ct-name" maxlength="16" value="${esc(t.name)}" placeholder="${f('exampleConcert')}">
            <label>${f('icon')}</label>
            <div class="cal-icons">${ICON_SET.map(i => `<button type="button" data-i="${i}" class="${!t.img && t.icon === i ? 'on' : ''}"><i data-lucide="${i}"></i></button>`).join('')}</div>
            <button class="st-btn st-btn-g st-btn-fw" type="button" data-a="img"><i data-lucide="image-plus"></i>${t.img ? f('replaceImage') : f('ownImage')}</button>
            <input type="file" id="cal-ct-file" accept="image/*" hidden>
            <label>${f('color')}</label>
            <div class="cal-colors">${COLORS.map(color => `<button type="button" data-c="${color}" class="${t.color === color ? 'on' : ''}" style="background:${color}" aria-label="${f('color')}"></button>`).join('')}</div>
            <button class="st-btn st-btn-fw" type="button" data-a="ok" style="margin-top:6px">${old ? c('save') : f('create')}</button>
            ${old ? `<button class="cal-del" type="button" data-a="del"><i data-lucide="trash-2"></i>${f('deleteType')}</button>` : ''}
          </div>`, (root, close) => {
          const pv = root.querySelector('#cal-ct-prev');
          const redraw = () => { pv.innerHTML = prev(); if (typeof initializeIcons === 'function') initializeIcons(pv); };
          root.querySelector('#cal-ct-name').addEventListener('input', e => { t.name = e.target.value.trim(); redraw(); });
          root.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
            t.icon = b.dataset.i; t.img = '';
            root.querySelectorAll('[data-i]').forEach(x => x.classList.toggle('on', x === b)); redraw();
          }));
          root.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
            t.color = b.dataset.c; root.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); redraw();
          }));
          const file = root.querySelector('#cal-ct-file');
          root.querySelector('[data-a="img"]').addEventListener('click', () => file.click());
          file.addEventListener('change', async () => {
            const imageFile = file.files[0]; if (!imageFile) return;
            if (!imageFile.type.startsWith('image/')) { ctx.toast(f('selectImage')); return; }
            try { t.img = await compress(imageFile, 128, true); root.querySelectorAll('[data-i]').forEach(x => x.classList.remove('on')); redraw(); }
            catch (_) { ctx.toast(f('imageError')); }
          });
          root.querySelector('[data-a="ok"]').addEventListener('click', () => {
            if (!t.name) { ctx.toast(f('enterTitle')); root.querySelector('#cal-ct-name').focus(); return; }
            const i = CUSTOM.findIndex(x => x.id === t.id);
            if (i >= 0) CUSTOM[i] = t; else CUSTOM.push(t);
            if (!saveCustom()) { ctx.toast(f('memoryImage')); return; }
            draft.type = t.id; close(); screen.refresh();
          });
          root.querySelector('[data-a="del"]')?.addEventListener('click', () => {
            const n = events.concat(personalEvents).filter(e => e.type === t.id).length;
            if (!confirm(bText('deleteTypeConfirm') + ' «' + t.name + '»?' + (n ? ' ' + bText('typeEventsChange', n) : ''))) return;
            CUSTOM = CUSTOM.filter(x => x.id !== t.id); saveCustom();
            if (draft.type === t.id) draft.type = 'transport';
            close(); screen.refresh();
          });
        });
      }

      function save() {
        const body = document.getElementById('mod-body');
        body && body._read && body._read();
        if (!draft.title) { ctx.toast(f('enterTitle')); body.querySelector('#f-title')?.focus(); return; }
        if (!draft.date) { ctx.toast(f('selectDate')); return; }
        if (draft.endTime && !draft.endDate) draft.endDate = draft.date;
        if (draft.endDate && draft.endDate < draft.date) { ctx.toast(c('endBeforeStart')); return; }
        if (draft.endDate === draft.date && draft.time && draft.endTime && draft.endTime < draft.time) { ctx.toast(f('endTimeBefore')); return; }
        if (draft.endDate && diffDays(draft.date, draft.endDate) > 90) { ctx.toast(f('eventTooLong')); return; }
        if (draft.endDate === draft.date && !draft.endTime) draft.endDate = '';
        delete draft._end;
        draft.updatedAt = Date.now();
        const wasTrip = events.some(x => x.id === draft.id);
        const wasPersonal = personalEvents.some(x => x.id === draft.id);
        events = events.filter(x => x.id !== draft.id);
        personalEvents = personalEvents.filter(x => x.id !== draft.id);
        if (draft.source === 'personal') personalEvents.push(draft); else events.push(draft);
        try { if (ctx.trip && (wasTrip || draft.source === 'trip')) saveEvents(); if (wasPersonal || draft.source === 'personal') savePersonalEvents(); }
        catch (_) { ctx.toast(f('memoryImage')); return; }
        selected = draft.date; month = selected.slice(0, 7);
        ctx.toast(ev ? f('saved') : f('added'));
        back === openMonth ? openMonth() : openDay();
      }
    }

    openMonth();
  });
})();
