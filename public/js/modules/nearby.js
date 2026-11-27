// ============================================================
// Модуль «Рядом» (id: 'nearby')
// Ответственный: Александр
// ------------------------------------------------------------
// Пока модуль не зарегистрирован, плитка «Рядом» показывает
// «В разработке». Как начать — см. js/modules/_template.js:
// скопируйте шаблон сюда и поставьте ID = 'nearby'.
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NEAR_KEYS = ['helperError','noGps','locating','gpsDenied','findMe','all','cafe','shops','fuel','km','places','routing','min','searching','nothing','route','selectedPoint','searchCenter','trip','searchPoint','mapLoad','placesError','addressMissing','routeNotFound','m'];
  const NEAR_TEXT = {
    ru:'Не найден nearby-api.js|Нет GPS|Определяем геопозицию…|Нет доступа к геопозиции|Найти меня|Все|Кафе|Магазины|Заправки|км|Места рядом|Строим маршрут…|мин|Поиск мест…|Ничего не найдено|Маршрут|Выбранная точка|Центр поиска|Поездка|Точка поиска|Не удалось загрузить карту|Не удалось загрузить места рядом — проверьте интернет и попробуйте ещё раз|Адрес не указан|Маршрут не найден|м',
    en:'nearby-api.js not found|GPS unavailable|Finding your location…|Location access denied|Find me|All|Cafés|Shops|Fuel|km|Nearby places|Building route…|min|Searching places…|Nothing found|Route|Selected point|Search center|Trip|Search point|Could not load map|Could not load nearby places — check your internet connection and try again|Address unavailable|Route not found|m',
    de:'nearby-api.js nicht gefunden|GPS nicht verfügbar|Standort wird ermittelt…|Kein Zugriff auf Standort|Meinen Standort finden|Alle|Cafés|Geschäfte|Tankstellen|km|Orte in der Nähe|Route wird berechnet…|Min.|Orte werden gesucht…|Nichts gefunden|Route|Ausgewählter Punkt|Suchzentrum|Reise|Suchpunkt|Karte konnte nicht geladen werden|Orte in der Nähe konnten nicht geladen werden — Internet prüfen und erneut versuchen|Adresse nicht angegeben|Route nicht gefunden|m',
    fr:'nearby-api.js introuvable|GPS indisponible|Recherche de votre position…|Accès à la position refusé|Me localiser|Tout|Cafés|Boutiques|Stations-service|km|Lieux à proximité|Calcul de l’itinéraire…|min|Recherche de lieux…|Aucun résultat|Itinéraire|Point sélectionné|Centre de recherche|Voyage|Point de recherche|Impossible de charger la carte|Impossible de charger les lieux à proximité — vérifiez Internet et réessayez|Adresse non indiquée|Itinéraire introuvable|m',
    it:'nearby-api.js non trovato|GPS non disponibile|Ricerca della posizione…|Accesso alla posizione negato|Trova la mia posizione|Tutti|Caffè|Negozi|Carburante|km|Luoghi vicini|Calcolo itinerario…|min|Ricerca luoghi…|Nessun risultato|Itinerario|Punto selezionato|Centro ricerca|Viaggio|Punto ricerca|Impossibile caricare la mappa|Impossibile caricare i luoghi vicini — controlla Internet e riprova|Indirizzo non disponibile|Itinerario non trovato|m',
    es:'No se encontró nearby-api.js|GPS no disponible|Buscando ubicación…|Acceso a la ubicación denegado|Encontrarme|Todos|Cafés|Tiendas|Gasolineras|km|Lugares cercanos|Calculando ruta…|min|Buscando lugares…|No se encontró nada|Ruta|Punto seleccionado|Centro de búsqueda|Viaje|Punto de búsqueda|No se pudo cargar el mapa|No se pudieron cargar lugares cercanos: revisa Internet e inténtalo de nuevo|Dirección no indicada|Ruta no encontrada|m',
    pt:'nearby-api.js não encontrado|GPS indisponível|A obter localização…|Acesso à localização negado|Encontrar-me|Todos|Cafés|Lojas|Combustível|km|Locais próximos|A calcular percurso…|min|A procurar locais…|Nada encontrado|Percurso|Ponto selecionado|Centro da pesquisa|Viagem|Ponto de pesquisa|Não foi possível carregar o mapa|Não foi possível carregar locais próximos — verifique a Internet e tente novamente|Morada não indicada|Percurso não encontrado|m',
    pl:'Nie znaleziono nearby-api.js|GPS niedostępny|Ustalanie lokalizacji…|Brak dostępu do lokalizacji|Znajdź mnie|Wszystkie|Kawiarnie|Sklepy|Stacje paliw|km|Miejsca w pobliżu|Wyznaczanie trasy…|min|Wyszukiwanie miejsc…|Nic nie znaleziono|Trasa|Wybrany punkt|Środek wyszukiwania|Podróż|Punkt wyszukiwania|Nie udało się załadować mapy|Nie udało się wczytać pobliskich miejsc — sprawdź Internet i spróbuj ponownie|Brak adresu|Nie znaleziono trasy|m',
    el:'Δεν βρέθηκε το nearby-api.js|Το GPS δεν είναι διαθέσιμο|Εντοπισμός θέσης…|Δεν επιτρέπεται η πρόσβαση στη θέση|Εντοπισμός μου|Όλα|Καφέ|Καταστήματα|Καύσιμα|χλμ.|Κοντινά μέρη|Υπολογισμός διαδρομής…|λεπ.|Αναζήτηση μερών…|Δεν βρέθηκε τίποτα|Διαδρομή|Επιλεγμένο σημείο|Κέντρο αναζήτησης|Ταξίδι|Σημείο αναζήτησης|Δεν ήταν δυνατή η φόρτωση του χάρτη|Δεν ήταν δυνατή η φόρτωση κοντινών μερών — ελέγξτε το διαδίκτυο και δοκιμάστε ξανά|Δεν υπάρχει διεύθυνση|Δεν βρέθηκε διαδρομή|μ.',
    tr:'nearby-api.js bulunamadı|GPS kullanılamıyor|Konum belirleniyor…|Konum erişimi reddedildi|Konumumu bul|Tümü|Kafeler|Mağazalar|Benzinlikler|km|Yakındaki yerler|Rota oluşturuluyor…|dk|Yerler aranıyor…|Sonuç bulunamadı|Rota|Seçilen nokta|Arama merkezi|Gezi|Arama noktası|Harita yüklenemedi|Yakındaki yerler yüklenemedi — interneti kontrol edip tekrar deneyin|Adres belirtilmemiş|Rota bulunamadı|m'
  };
  const ntxt = key => (NEAR_TEXT[typeof getLang === 'function' ? getLang() : 'ru'] || NEAR_TEXT.en).split('|')[NEAR_KEYS.indexOf(key)] || key;
  window.STNearbyText = ntxt;

  STHub.addStyles('nearby', `
    .nb-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; align-items: center; }
    .nb-bar .st-btn { padding: 6px 10px; font-size: 13px; }
    .nb-map-box { width: 100%; height: 320px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(128,128,128,0.25); margin-bottom: 12px; background: #e5e3df; }
    #nb-map { width: 100%; height: 100%; z-index: 1; }
    .nb-pin { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; color: #fff; font-size: 14px; border: 2px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.35); }
    .nb-route { display: none; justify-content: space-between; align-items: center; padding: 8px 12px; margin-bottom: 10px; border-radius: 8px; background: rgba(41, 128, 185, 0.12); font-size: 13px; }
    .nb-card-on { outline: 2px solid #2980b9; }
  `);

  function loadHelper() {
    if (window.NearbyAPI) return Promise.resolve(window.NearbyAPI);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = '/js/modules/nearby-api.js?v=135'; // ?v= — чтобы телефон не брал старую копию из кэша
      s.onload = () => res(window.NearbyAPI);
      s.onerror = () => rej(new Error(ntxt('helperError')));
      document.head.appendChild(s);
    });
  }

  STHub.registerService('nearby', ctx => {
    let lat = 52.5200, lon = 13.4050;
    let type = ctx.store.get('type', 'all'), radius = ctx.store.get('radius', 2000);
    let map, layer, uMark, circle, rLine;

    const locate = manual => {
      if (!('geolocation' in navigator)) return manual && ctx.toast(ntxt('noGps'));
      if (manual) ctx.toast(ntxt('locating'));
      navigator.geolocation.getCurrentPosition(p => {
        lat = p.coords.latitude; lon = p.coords.longitude;
        document.getElementById('nb-rad')?.dispatchEvent(new Event('change'));
      }, () => manual && ctx.toast(ntxt('gpsDenied')), { enableHighAccuracy: true, timeout: 6000 });
    };

    ctx.openScreen({
      title: ctx.title,
      action: { icon: 'locate-fixed', label: ntxt('findMe'), onClick: () => locate(true) },
      async render(body) {
        body.innerHTML = `
          <div class="nb-bar">
            <button class="st-btn ${type === 'all' ? '' : 'st-btn-g'}" data-t="all">🌍 ${ntxt('all')}</button>
            <button class="st-btn ${type === 'cafe' ? '' : 'st-btn-g'}" data-t="cafe">☕ ${ntxt('cafe')}</button>
            <button class="st-btn ${type === 'shop' ? '' : 'st-btn-g'}" data-t="shop">🛒 ${ntxt('shops')}</button>
            <button class="st-btn ${type === 'fuel' ? '' : 'st-btn-g'}" data-t="fuel">⛽ ${ntxt('fuel')}</button>
            <select class="st-input" id="nb-rad" style="width:auto;padding:6px 10px;margin:0;">
              <option value="1000" ${radius === 1000 ? 'selected' : ''}>1 ${ntxt('km')}</option>
              <option value="2000" ${radius === 2000 ? 'selected' : ''}>2 ${ntxt('km')}</option>
              <option value="5000" ${radius === 5000 ? 'selected' : ''}>5 ${ntxt('km')}</option>
              <option value="10000" ${radius === 10000 ? 'selected' : ''}>10 ${ntxt('km')}</option>
            </select>
          </div>
          <div class="nb-route" id="nb-rbar"><span id="nb-rtxt"></span><button class="st-btn st-btn-g" id="nb-roff" style="padding:4px 8px;font-size:12px;">✖</button></div>
          <div class="nb-map-box"><div id="nb-map"></div></div>
          <div class="st-card-title" id="nb-ttl" style="margin-bottom:8px;">${ntxt('places')}</div>
          <div id="nb-list"></div>`;

        let api;
        try { api = await loadHelper(); await api.ensureLeaflet(); }
        catch (e) { body.querySelector('#nb-list').innerHTML = `<div class="st-empty"><div>${esc(e.message)}</div></div>`; return; }

        map = L.map('nb-map').setView(new Array(lat, lon), 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(map);
        layer = L.layerGroup().addTo(map);
        setTimeout(() => map?.invalidateSize(), 200);

        const clearRoute = () => { if (rLine) { map.removeLayer(rLine); rLine = null; } body.querySelector('#nb-rbar').style.display = 'none'; };
        const updateCenter = (lbl, fit) => {
          if (uMark) map.removeLayer(uMark); if (circle) map.removeLayer(circle);
          circle = L.circle(new Array(lat, lon), { radius, color: '#3498db', weight: 1, fillOpacity: 0.08 }).addTo(map);
          uMark = L.circleMarker(new Array(lat, lon), { radius: 8, color: '#fff', weight: 2, fillColor: '#e74c3c', fillOpacity: 1 }).addTo(map).bindPopup(`<b>${esc(lbl)}</b>`);
          if (fit) map.fitBounds(circle.getBounds(), { padding: new Array(15, 15) });
        };

        const buildRoute = async p => {
          ctx.toast(ntxt('routing'));
          try {
            const r = await api.fetchRoute(lat, lon, p.lat, p.lon);
            clearRoute();
            rLine = L.polyline(r.coords, { color: '#2980b9', weight: 5, opacity: 0.85 }).addTo(map);
            map.fitBounds(rLine.getBounds(), { padding: new Array(30, 30) });
            body.querySelector('#nb-rtxt').textContent = `${p.name}: ${api.fmtDist(r.distance)} (~${r.mins} ${ntxt('min')})`;
            body.querySelector('#nb-rbar').style.display = 'flex';
          } catch (e) { ctx.toast(e.message); }
        };

        const loadPlaces = async () => {
          const list = body.querySelector('#nb-list');
          list.innerHTML = `<div class="st-empty"><div>${ntxt('searching')}</div></div>`;
          layer.clearLayers();
          try {
            const places = await api.fetchPlaces(lat, lon, type, radius);
            body.querySelector('#nb-ttl').textContent = `${ntxt('places')} (${places.length})`;
            if (!places.length) { list.innerHTML = `<div class="st-empty"><div>${ntxt('nothing')}</div></div>`; return; }
            list.innerHTML = '';
            places.forEach(p => {
              const st = p.category === 'Кафе' ? { c: '#e67e22', e: '☕', label: ntxt('cafe') } : p.category === 'Заправка' ? { c: '#2980b9', e: '⛽', label: ntxt('fuel') } : { c: '#27ae60', e: '🛒', label: ntxt('shops') };
              const icon = L.divIcon({ className: '', html: `<div class="nb-pin" style="background:${st.c}">${st.e}</div>`, iconSize: new Array(32, 32), iconAnchor: new Array(16, 16), popupAnchor: new Array(0, -16) });
              const m = L.marker(new Array(p.lat, p.lon), { icon }).bindPopup(`<b>${esc(p.name)}</b><br>${esc(st.label)} • ${api.fmtDist(p.distance)}<br>${esc(p.address)}`).addTo(layer);

              const card = document.createElement('div');
              card.className = 'st-card'; card.style.cssText = 'cursor:pointer;margin-bottom:8px;';
              card.innerHTML = `<div class="st-row" style="padding:0;"><span class="st-row-ic">${st.e}</span><span class="st-row-txt"><span class="st-row-ttl">${esc(p.name)} <span class="st-muted">(${api.fmtDist(p.distance)})</span></span><span class="st-muted" style="font-size:12px;">${esc(st.label)} • ${esc(p.address)}</span></span><button class="st-btn st-btn-g nb-go" style="padding:6px 10px;font-size:12px;">🧭 ${ntxt('route')}</button></div>`;
              card.onclick = () => { body.querySelectorAll('.st-card').forEach(x => x.classList.remove('nb-card-on')); card.classList.add('nb-card-on'); map.flyTo(new Array(p.lat, p.lon), 16, { duration: 0.7 }); m.openPopup(); };
              card.querySelector('.nb-go').onclick = e => { e.stopPropagation(); buildRoute(p); };
              list.appendChild(card);
            });
          } catch (e) { list.innerHTML = `<div class="st-empty"><div>${esc(e.message)}</div></div>`; }
        };

        map.on('click', e => { lat = e.latlng.lat; lon = e.latlng.lng; clearRoute(); updateCenter(ntxt('selectedPoint'), false); loadPlaces(); });
        body.querySelectorAll('.nb-bar button[data-t]').forEach(b => b.onclick = () => {
          type = b.dataset.t; ctx.store.set('type', type);
          body.querySelectorAll('.nb-bar button[data-t]').forEach(x => x.classList.toggle('st-btn-g', x.dataset.t !== type));
          loadPlaces();
        });
        body.querySelector('#nb-rad').onchange = e => { radius = +e.target.value; ctx.store.set('radius', radius); clearRoute(); updateCenter(ntxt('searchCenter'), true); loadPlaces(); };
        body.querySelector('#nb-roff').onclick = clearRoute;

        if (ctx.trip?.dest) { const c = await api.geocodeCity(ctx.trip.dest); if (c) { lat = c.lat; lon = c.lon; } }
        updateCenter(ctx.trip?.dest ? `${ntxt('trip')}: ${ctx.trip.dest}` : ntxt('searchPoint'), true);
        loadPlaces(); locate(false);
      }
    });
  });
})();

