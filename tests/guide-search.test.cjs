const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/guide.js'), 'utf8');
const code = source.replace(/\}\)\(\);\s*$/, 'globalThis.guideSearchTest = { matchesPlaceQuery, placeInCity, photonSearchPlaces, mergePlaces, enrichPlaceWiki };\n})();');
const context = {
  window: { STHub: { addStyles() {}, registerService() {} } },
  fetch: async url => ({ ok: true, json: async () => {
    if (url.includes('list=geosearch')) return { query: { geosearch: [{ title: 'Башни Ушче' }] } };
    assert.match(url, /q=puff%20/);
    return { features: [{ properties: {
      name: 'Princess Puff', osm_key: 'shop', osm_value: 'bakery', osm_type: 'N', osm_id: 1,
      city: 'Belgrade', street: 'Kneza Mihaila'
    }, geometry: { coordinates: [20.459, 44.816] } }] };
  } }),
  AbortController, setTimeout, clearTimeout
};
context.STHub = context.window.STHub;
vm.runInNewContext(code, context);
const { matchesPlaceQuery, placeInCity, photonSearchPlaces, mergePlaces, enrichPlaceWiki } = context.guideSearchTest;

assert.equal(matchesPlaceQuery({ name: 'Nikola Tesla Museum' }, 'тесла'), true);
assert.equal(matchesPlaceQuery({ name: 'Nikola Tesla Museum' }, 'музей Тесла'), true);
assert.equal(matchesPlaceQuery({ name: 'Museum of Aviation', addr: 'Nikola Tesla Airport' }, 'музей Тесла'), false);
assert.equal(matchesPlaceQuery({ name: 'Sensō-ji' }, 'Senso-ji'), true);
assert.equal(matchesPlaceQuery({ name: 'Musée du Louvre' }, 'Louvre'), true);
assert.equal(matchesPlaceQuery({ name: 'Roscioli' }, 'roscioli'), true);
assert.equal(matchesPlaceQuery({ name: 'Curry 36' }, 'curry'), true);
assert.equal(matchesPlaceQuery({ name: 'Princess Puff' }, 'puff'), true);
assert.equal(matchesPlaceQuery({ name: 'Princess Puff' }, 'princess'), true);
assert.equal(matchesPlaceQuery({ name: 'Princess Puff' }, 'Princess Puff Belgrade'), true);
assert.equal(matchesPlaceQuery({ name: 'Princess Puff', addr: 'Tesla Street' }, 'тесла'), false);

const belgrade = {
  lat: 44.8125, lon: 20.4612, displayName: 'Белград, Сербия',
  searchBounds: [44.7, 44.9, 20.3, 20.6]
};
assert.equal(placeInCity(belgrade, 44.816, 20.459), true);
assert.equal(placeInCity(belgrade, 45.0, 20.459), false);
const sameMuseum = mergePlaces(
  [{ id: 'wiki-museum', name: 'Музей Николы Теслы', cat: 'museum', lat: 44.805, lon: 20.47, score: 5 }],
  [{ id: 'osm-museum', name: 'Nikola Tesla Museum', cat: 'museum', lat: 44.80501, lon: 20.47001, score: 5 }]
);
assert.equal(sameMuseum.length, 1);
Promise.all([
  photonSearchPlaces('puff', belgrade),
  enrichPlaceWiki({ id: 'restaurant', name: 'Restaurant & Museum Tesla', lat: 44.81, lon: 20.46 })
]).then(([places, unrelatedWiki]) => {
  assert.equal(places.length, 1);
  assert.equal(places[0].name, 'Princess Puff');
  assert.equal(places[0].cat, 'food');
  assert.equal(unrelatedWiki, null);
  console.log('Guide search checks passed');
}).catch(error => { console.error(error); process.exitCode = 1; });
