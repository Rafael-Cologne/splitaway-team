// ============================================================
// Модуль «Маршрут» (id: 'route')
// Ответственный: Здислав
// Источники: сохранённые места из «Гид и места», Leaflet + OSM, OSRM
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const ID = 'route';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ROUTE_KEYS = ['mapLoad','offline','optimize','needThree','optimized','emptyStart','guide','emptyEnd','import','imported','walk','drive','stops','visited','distance','duration','google','fromPrevious','start','notVisited','done','up','down','remove','removed','m','km','min','h'];
  const ROUTE_TEXT = {
    ru:'Не удалось загрузить карту|Нет сети|Оптимизировать|Для оптимизации нужно минимум 3 точки|Порядок точек оптимизирован|В маршруте пока нет точек. Откройте|«Гид и места»|и добавьте понравившиеся места в «Мой план».|Загрузить сохранённые места|Места загружены в маршрут|Пешком|На авто|Точек|пройдено|Расстояние|В пути|Открыть маршрут в Google Картах|от предыдущей|Старт|Не пройдено|Пройдено|Выше|Ниже|Убрать|Убрано из маршрута|м|км|мин|ч',
    en:'Could not load the map|Offline|Optimize|At least 3 stops are needed to optimize|Stop order optimized|No stops in this route yet. Open|Guide & places|and add places to My plan.|Load saved places|Places loaded into route|Walk|Drive|Stops|visited|Distance|Travel time|Open route in Google Maps|from previous|Start|Not visited|Visited|Move up|Move down|Remove|Removed from route|m|km|min|h',
    de:'Karte konnte nicht geladen werden|Keine Verbindung|Optimieren|Zum Optimieren sind mindestens 3 Stopps nötig|Reihenfolge optimiert|Diese Route hat noch keine Stopps. Öffne|Reiseführer und Orte|und füge Orte zu „Mein Plan“ hinzu.|Gespeicherte Orte laden|Orte zur Route hinzugefügt|Zu Fuß|Mit dem Auto|Stopps|besucht|Entfernung|Fahrzeit|Route in Google Maps öffnen|vom vorherigen|Start|Nicht besucht|Besucht|Nach oben|Nach unten|Entfernen|Aus Route entfernt|m|km|Min.|Std.',
    fr:'Impossible de charger la carte|Hors ligne|Optimiser|Il faut au moins 3 étapes pour optimiser|Ordre des étapes optimisé|Cet itinéraire ne contient aucune étape. Ouvrez|Guide et lieux|et ajoutez des lieux à Mon plan.|Charger les lieux enregistrés|Lieux ajoutés à l’itinéraire|À pied|En voiture|Étapes|visitées|Distance|Durée|Ouvrir l’itinéraire dans Google Maps|depuis la précédente|Départ|Non visité|Visité|Monter|Descendre|Supprimer|Retiré de l’itinéraire|m|km|min|h',
    it:'Impossibile caricare la mappa|Nessuna connessione|Ottimizza|Servono almeno 3 tappe per ottimizzare|Ordine delle tappe ottimizzato|Questo itinerario non ha ancora tappe. Apri|Guida e luoghi|e aggiungi luoghi a Il mio piano.|Carica luoghi salvati|Luoghi aggiunti all’itinerario|A piedi|In auto|Tappe|visitate|Distanza|Durata|Apri itinerario in Google Maps|dalla precedente|Partenza|Non visitato|Visitato|Sposta su|Sposta giù|Rimuovi|Rimosso dall’itinerario|m|km|min|h',
    es:'No se pudo cargar el mapa|Sin conexión|Optimizar|Se necesitan al menos 3 paradas para optimizar|Orden de paradas optimizado|Esta ruta aún no tiene paradas. Abre|Guía y lugares|y añade lugares a Mi plan.|Cargar lugares guardados|Lugares añadidos a la ruta|A pie|En coche|Paradas|visitadas|Distancia|Duración|Abrir ruta en Google Maps|desde la anterior|Inicio|No visitado|Visitado|Subir|Bajar|Quitar|Quitado de la ruta|m|km|min|h',
    pt:'Não foi possível carregar o mapa|Sem ligação|Otimizar|São necessárias pelo menos 3 paragens para otimizar|Ordem das paragens otimizada|Este percurso ainda não tem paragens. Abra|Guia e locais|e adicione locais a O meu plano.|Carregar locais guardados|Locais adicionados ao percurso|A pé|De carro|Paragens|visitadas|Distância|Duração|Abrir percurso no Google Maps|desde a anterior|Início|Não visitado|Visitado|Subir|Descer|Remover|Removido do percurso|m|km|min|h',
    pl:'Nie udało się załadować mapy|Brak sieci|Optymalizuj|Do optymalizacji potrzeba co najmniej 3 punktów|Kolejność punktów zoptymalizowana|Na trasie nie ma jeszcze punktów. Otwórz|Przewodnik i miejsca|i dodaj miejsca do Mojego planu.|Wczytaj zapisane miejsca|Miejsca dodano do trasy|Pieszo|Samochodem|Punkty|odwiedzone|Odległość|Czas podróży|Otwórz trasę w Mapach Google|od poprzedniego|Start|Nieodwiedzone|Odwiedzone|Wyżej|Niżej|Usuń|Usunięto z trasy|m|km|min|godz.',
    el:'Δεν ήταν δυνατή η φόρτωση του χάρτη|Χωρίς σύνδεση|Βελτιστοποίηση|Χρειάζονται τουλάχιστον 3 στάσεις|Η σειρά των στάσεων βελτιστοποιήθηκε|Η διαδρομή δεν έχει ακόμη στάσεις. Ανοίξτε|Οδηγός και μέρη|και προσθέστε μέρη στο Πλάνο μου.|Φόρτωση αποθηκευμένων μερών|Τα μέρη προστέθηκαν στη διαδρομή|Με τα πόδια|Με αυτοκίνητο|Στάσεις|επισκέφθηκαν|Απόσταση|Διάρκεια|Άνοιγμα διαδρομής στο Google Maps|από το προηγούμενο|Αρχή|Δεν επισκέφθηκε|Επισκέφθηκε|Πάνω|Κάτω|Αφαίρεση|Αφαιρέθηκε από τη διαδρομή|μ.|χλμ.|λεπ.|ώ.',
    tr:'Harita yüklenemedi|Çevrimdışı|Optimize et|Optimizasyon için en az 3 durak gerekli|Durak sırası optimize edildi|Bu rotada henüz durak yok. Açın:|Rehber ve yerler|ve beğendiğiniz yerleri Planıma ekleyin.|Kaydedilen yerleri yükle|Yerler rotaya eklendi|Yürüyerek|Arabayla|Durak|ziyaret edildi|Mesafe|Süre|Rotayı Google Haritalar’da aç|öncekinden|Başlangıç|Ziyaret edilmedi|Ziyaret edildi|Yukarı|Aşağı|Kaldır|Rotadan kaldırıldı|m|km|dk|sa'
  };
  const rtxt = key => (ROUTE_TEXT[typeof getLang === 'function' ? getLang() : 'ru'] || ROUTE_TEXT.en).split('|')[ROUTE_KEYS.indexOf(key)] || key;

  STHub.addStyles(ID, `
    .st-route-bar{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
    .st-route-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;border:1px solid var(--hub-card-b);background:var(--hub-card);color:var(--text);font:inherit;font-size:.8rem;font-weight:600;cursor:pointer;transition:all .15s}
    .st-route-chip svg{width:14px;height:14px}
    .st-route-chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
    .st-route-map-wrap{position:relative;border-radius:18px;overflow:hidden;border:1px solid var(--hub-card-b);background:var(--hub-card);box-shadow:var(--hub-shadow)}
    .st-route-map{width:100%;height:260px;background:var(--hub-soft);z-index:1}
    .st-route-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px 12px;border-top:1px solid var(--hub-card-b);text-align:center}
    .st-route-stat-v{font-size:.95rem;font-weight:800;color:var(--text)}
    .st-route-stat-l{font-size:.7rem;color:var(--t2);margin-top:2px}
    .st-route-stop{display:flex;gap:11px;align-items:flex-start}
    .st-route-num{width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;font-size:.8rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
    .st-route-num.done{background:#16a34a}
    .st-route-info{flex:1;min-width:0}
    .st-route-sub{font-size:.78rem;color:var(--t2);margin-top:3px;display:flex;flex-wrap:wrap;gap:8px}
    .st-route-ctrls{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
    .st-route-ctrls .st-btn{min-height:32px;padding:0 10px;font-size:.76rem;border-radius:10px}
    .st-route-stop.done .st-card-title{text-decoration:line-through;opacity:.68}
    .st-route-pin{width:26px;height:26px;border-radius:50%;background:#5B4BEA;color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px}
    .st-route-pin.done{background:#16a34a}
  `);

  let leafletPromise = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      if (!document.getElementById('st-leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'st-leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => (window.L ? resolve(window.L) : reject(new Error(rtxt('mapLoad'))));
      script.onerror = () => {
        leafletPromise = null;
        reject(new Error(rtxt('mapLoad')));
      };
      document.head.appendChild(script);
    });
    return leafletPromise;
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDist(km) {
    if (!Number.isFinite(km)) return '—';
    return km < 1 ? `${Math.round(km * 1000)} ${rtxt('m')}` : `${km.toFixed(1)} ${rtxt('km')}`;
  }

  function formatDuration(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return '—';
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} ${rtxt('min')}`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} ${rtxt('h')} ${m} ${rtxt('min')}` : `${h} ${rtxt('h')}`;
  }

  function googleRouteUrl(stops, mode) {
    if (!stops.length) return '#';
    if (stops.length === 1) {
      return `https://www.google.com/maps/search/?api=1&query=${stops[0].lat},${stops[0].lon}`;
    }
    const first = stops[0];
    const last = stops[stops.length - 1];
    const middle = stops.slice(1, -1).slice(0, 9);
    const travel = mode === 'car' ? 'driving' : 'walking';
    let url = `https://www.google.com/maps/dir/?api=1&origin=${first.lat},${first.lon}&destination=${last.lat},${last.lon}&travelmode=${travel}`;
    if (middle.length) {
      url += `&waypoints=${encodeURIComponent(middle.map(p => `${p.lat},${p.lon}`).join('|'))}`;
    }
    return url;
  }

  async function fetchOsrmRoute(stops, mode) {
    const pts = stops.slice(0, 25);
    const coords = pts.map(p => `${p.lon},${p.lat}`).join(';');
    // Демо-сервер OSRM (router.project-osrm.org) умеет только авто — пешком он считал как на машине
    // (3,6 км за 7 мин). Поэтому пешком/на авто — серверы FOSSGIS с нужным профилем, демо — запасной для авто.
    const q = `${coords}?overview=full&geometries=geojson`;
    const urls = mode === 'car'
      ? [`https://routing.openstreetmap.de/routed-car/route/v1/driving/${q}`, `https://router.project-osrm.org/route/v1/driving/${q}`]
      : [`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${q}`];
    let json = null;
    for (const url of urls) {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 12000);
      try { const res = await fetch(url, { signal: ctl.signal }); if (res.ok) { json = await res.json(); if (json?.routes?.[0]) break; } } catch (_) {} finally { clearTimeout(timer); }
    }
    if (!json) throw new Error('OSRM error');
    const route = json?.routes?.[0];
    if (!route) throw new Error('No route');
    return {
      distKm: route.distance / 1000,
      durationSec: route.duration,
      latlngs: (route.geometry?.coordinates || []).map(c => [c[1], c[0]]),
      exact: true
    };
  }

  function fallbackRoute(stops, mode) {
    let km = 0;
    for (let i = 1; i < stops.length; i++) {
      km += haversineKm(stops[i - 1].lat, stops[i - 1].lon, stops[i].lat, stops[i].lon);
    }
    const speedKmh = mode === 'car' ? 35 : 4.8;
    return {
      distKm: km,
      durationSec: (km / speedKmh) * 3600,
      latlngs: stops.map(p => [p.lat, p.lon]),
      exact: false
    };
  }

  STHub.registerService(ID, ctx => {
    const tripId = ctx.trip ? ctx.trip.id : 'none';
    const guideKey = `st_mod_guide_${tripId}_saved`;
    const draftKey = 'st_mod_guide_none_saved';

    const state = {
      mode: ctx.store.get('mode', 'foot'), // 'foot' | 'car'
      map: null,
      alive: true,
      routeInfo: null
    };

    function readList(key) {
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }

    function writeGuideList(list) {
      try { localStorage.setItem(guideKey, JSON.stringify(list)); } catch (_) {}
    }

    function getOrderedStops() {
      const saved = readList(guideKey).filter(p => p && p.lat != null && p.lon != null);
      const orderIds = ctx.store.get('orderIds', []);
      const byId = new Map(saved.map(p => [p.id, p]));
      const ordered = [];
      for (const id of orderIds) {
        if (byId.has(id)) {
          ordered.push(byId.get(id));
          byId.delete(id);
        }
      }
      for (const rest of byId.values()) ordered.push(rest);
      return ordered;
    }

    function saveOrder(stops) {
      ctx.store.set('orderIds', stops.map(p => p.id));
    }

    function optimizeStops(stops) {
      if (stops.length <= 2) return stops;
      const remaining = stops.slice(1);
      const result = [stops[0]];
      while (remaining.length) {
        const cur = result[result.length - 1];
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const d = haversineKm(cur.lat, cur.lon, remaining[i].lat, remaining[i].lon);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        result.push(remaining.splice(bestIdx, 1)[0]);
      }
      return result;
    }

    function destroyMap() {
      if (state.map) {
        try { state.map.remove(); } catch (_) {}
        state.map = null;
      }
    }

    function renderMapAndRoute(stops, body) {
      const el = body.querySelector('#st-route-map');
      if (!el || !stops.length) return;
      destroyMap();

      loadLeaflet().then(async L => {
        if (!state.alive || !document.body.contains(el)) return;
        const map = L.map(el, { zoomControl: true }).setView([stops[0].lat, stops[0].lon], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19
        }).addTo(map);
        state.map = map;

        stops.forEach((p, idx) => {
          const icon = L.divIcon({
            className: '',
            html: `<div class="st-route-pin${p.visited ? ' done' : ''}">${idx + 1}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          });
          L.marker([p.lat, p.lon], { icon })
            .bindPopup(`<strong>${idx + 1}. ${esc(p.name)}</strong>${p.addr ? `<br>${esc(p.addr)}` : ''}`)
            .addTo(map);
        });

        const bounds = L.latLngBounds(stops.map(p => [p.lat, p.lon]));
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
        setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 80);

        if (stops.length >= 2) {
          let routeData;
          try {
            routeData = await fetchOsrmRoute(stops, state.mode);
          } catch (_) {
            routeData = fallbackRoute(stops, state.mode);
          }
          if (!state.alive || state.map !== map) return;

          L.polyline(routeData.latlngs, {
            color: '#5B4BEA',
            weight: 4,
            opacity: 0.88,
            dashArray: routeData.exact ? null : '6 6'
          }).addTo(map);

          const distEl = body.querySelector('#st-route-dist');
          const timeEl = body.querySelector('#st-route-time');
          if (distEl) distEl.textContent = formatDist(routeData.distKm);
          if (timeEl) timeEl.textContent = (routeData.exact ? '' : '~') + formatDuration(routeData.durationSec);
        }
      }).catch(() => {
        const distEl = body.querySelector('#st-route-dist');
        if (distEl) distEl.textContent = rtxt('offline');
      });
    }

    ctx.openScreen({
      title: ctx.title,
      action: {
        icon: 'wand-sparkles',
        label: rtxt('optimize'),
        onClick: screen => {
          const stops = getOrderedStops();
          if (stops.length < 3) {
            ctx.toast(rtxt('needThree'));
            return;
          }
          saveOrder(optimizeStops(stops));
          ctx.toast(rtxt('optimized'));
          screen.refresh();
        }
      },
      render(body, screen) {
        const stops = getOrderedStops();
        const draftStops = tripId !== 'none' ? readList(draftKey) : [];

        if (!stops.length) {
          destroyMap();
          body.innerHTML = `
            <div class="st-empty">
              <i data-lucide="route"></i>
              <div>${rtxt('emptyStart')}<br><strong>${rtxt('guide')}</strong> ${rtxt('emptyEnd')}</div>
            </div>
            ${draftStops.length
              ? `<button class="st-btn st-btn-fw" type="button" id="st-route-import"><i data-lucide="download"></i>${rtxt('import')} (${draftStops.length})</button>`
              : ''}
          `;
          body.querySelector('#st-route-import')?.addEventListener('click', () => {
            writeGuideList(draftStops);
            saveOrder(draftStops);
            ctx.toast(rtxt('imported'));
            screen.refresh();
          });
          return;
        }

        const gUrl = googleRouteUrl(stops, state.mode);
        const visitedCount = stops.filter(s => s.visited).length;

        body.innerHTML = `
          <div class="st-route-bar">
            <button class="st-route-chip${state.mode === 'foot' ? ' on' : ''}" type="button" data-route-mode="foot">
              <i data-lucide="footprints"></i>${rtxt('walk')}
            </button>
            <button class="st-route-chip${state.mode === 'car' ? ' on' : ''}" type="button" data-route-mode="car">
              <i data-lucide="car"></i>${rtxt('drive')}
            </button>
            ${stops.length >= 3
              ? `<button class="st-route-chip" type="button" id="st-route-opt"><i data-lucide="wand-sparkles"></i>${rtxt('optimize')}</button>`
              : ''}
          </div>

          <div class="st-route-map-wrap">
            <div class="st-route-map" id="st-route-map"></div>
            <div class="st-route-stats">
              <div>
                <div class="st-route-stat-v">${stops.length}</div>
                <div class="st-route-stat-l">${rtxt('stops')} (${visitedCount} ${rtxt('visited')})</div>
              </div>
              <div>
                <div class="st-route-stat-v" id="st-route-dist">${stops.length >= 2 ? '…' : '0 ' + rtxt('m')}</div>
                <div class="st-route-stat-l">${rtxt('distance')}</div>
              </div>
              <div>
                <div class="st-route-stat-v" id="st-route-time">${stops.length >= 2 ? '…' : '0 ' + rtxt('min')}</div>
                <div class="st-route-stat-l">${rtxt('duration')}</div>
              </div>
            </div>
          </div>

          <a class="st-btn st-btn-fw" href="${gUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">
            <i data-lucide="navigation"></i>${rtxt('google')}
          </a>

          ${stops.map((p, idx) => {
            const prev = idx > 0 ? stops[idx - 1] : null;
            const segDist = prev ? formatDist(haversineKm(prev.lat, prev.lon, p.lat, p.lon)) : '';
            return `
              <div class="st-card st-route-stop${p.visited ? ' done' : ''}">
                <div class="st-route-num${p.visited ? ' done' : ''}">${idx + 1}</div>
                <div class="st-route-info">
                  <div class="st-card-title">${esc(p.name)}</div>
                  <div class="st-route-sub">
                    ${p.typeLabel ? `<span>${esc(p.typeLabel)}</span>` : ''}
                     ${segDist ? `<span>• +${esc(segDist)} ${rtxt('fromPrevious')}</span>` : `<span>• ${rtxt('start')}</span>`}
                    ${p.addr ? `<span>• ${esc(p.addr)}</span>` : ''}
                  </div>
                  <div class="st-route-ctrls">
                    <button class="st-btn ${p.visited ? 'st-btn-g' : ''}" type="button" data-stop-visit="${esc(p.id)}">
                       <i data-lucide="${p.visited ? 'rotate-ccw' : 'check'}"></i>${p.visited ? rtxt('notVisited') : rtxt('done')}
                    </button>
                     ${idx > 0 ? `<button class="st-btn st-btn-g" type="button" data-stop-up="${idx}" aria-label="${rtxt('up')}"><i data-lucide="arrow-up"></i></button>` : ''}
                     ${idx < stops.length - 1 ? `<button class="st-btn st-btn-g" type="button" data-stop-down="${idx}" aria-label="${rtxt('down')}"><i data-lucide="arrow-down"></i></button>` : ''}
                     <button class="st-btn st-btn-g" type="button" data-stop-del="${esc(p.id)}" aria-label="${rtxt('remove')}"><i data-lucide="trash-2"></i></button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        `;

        renderMapAndRoute(stops, body);

        body.querySelectorAll('[data-route-mode]').forEach(btn => {
          btn.addEventListener('click', () => {
            state.mode = btn.dataset.routeMode;
            ctx.store.set('mode', state.mode);
            screen.refresh();
          });
        });

        body.querySelector('#st-route-opt')?.addEventListener('click', () => {
          saveOrder(optimizeStops(stops));
          ctx.toast(rtxt('optimized'));
          screen.refresh();
        });

        body.querySelectorAll('[data-stop-up]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.stopUp);
            if (idx <= 0) return;
            const next = stops.slice();
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            saveOrder(next);
            screen.refresh();
          });
        });

        body.querySelectorAll('[data-stop-down]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.stopDown);
            if (idx >= stops.length - 1) return;
            const next = stops.slice();
            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
            saveOrder(next);
            screen.refresh();
          });
        });

        body.querySelectorAll('[data-stop-visit]').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.stopVisit;
            const list = readList(guideKey).map(x => (x.id === id ? { ...x, visited: !x.visited } : x));
            writeGuideList(list);
            screen.refresh();
          });
        });

        body.querySelectorAll('[data-stop-del]').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.stopDel;
            const list = readList(guideKey).filter(x => x.id !== id);
            writeGuideList(list);
            saveOrder(stops.filter(x => x.id !== id));
            ctx.toast(rtxt('removed'));
            screen.refresh();
          });
        });
      }
    });
  });
})();
