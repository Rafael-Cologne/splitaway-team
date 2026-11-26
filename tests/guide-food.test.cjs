const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/guide.js'), 'utf8');
const code = source.replace(/\}\)\(\);\s*$/, 'globalThis.testGuideFood = { photonFoodPlaces, mergePlaces };\n})();');
const hub = { addStyles() {}, registerService() {} };
const context = {
  window: { STHub: hub }, STHub: hub, AbortController, setTimeout, clearTimeout,
  fetch: async url => ({ ok: true, json: async () => {
    const term = new URL(url).searchParams.get('q');
    const food = term.startsWith('restaurant') ? 'restaurant' : term.startsWith('cafe') ? 'cafe' : 'bakery';
    return { features: [
      { properties: { name: 'Local ' + food, osm_key: food === 'bakery' ? 'shop' : 'amenity', osm_value: food,
        osm_type: 'N', osm_id: food, street: 'Main Street' }, geometry: { coordinates: [20.46, 44.81] } },
      { properties: { name: 'Remote ' + food, osm_key: 'amenity', osm_value: food },
        geometry: { coordinates: [19.0, 43.0] } }
    ] };
  } })
};
vm.runInNewContext(code, context);
const { photonFoodPlaces, mergePlaces } = context.testGuideFood;
photonFoodPlaces({ displayName: 'Белград, Сербия', lat: 44.8125, lon: 20.4612 }).then(places => {
  assert.equal(places.length, 4);
  assert.equal(mergePlaces([], places).length, 3);
  assert.deepEqual([...new Set(places.map(p => p.typeLabel))].sort(), ['Кафе', 'Пекарня', 'Ресторан']);
  assert.equal(mergePlaces(places.slice(0, 1), places.slice(0, 1)).length, 1);
  console.log('Guide food checks passed');
}).catch(error => { console.error(error); process.exitCode = 1; });
