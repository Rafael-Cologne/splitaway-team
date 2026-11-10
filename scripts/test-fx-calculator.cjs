const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = {};
const document = { addEventListener() {} };
const context = { window, document, Intl, Number, BigInt };
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/js/fx-calculator.js', 'utf8'), context);

const convert = window.SplitawayFx.convertMinor;
assert.deepEqual({ ...convert('120', '0.13322', 'CNY', 'EUR') }, { minor: 1599, digits: 2 });
assert.deepEqual({ ...convert('0.01', '1', 'EUR', 'EUR') }, { minor: 1, digits: 2 });
assert.deepEqual({ ...convert('120', '0.12', 'CNY', 'EUR') }, { minor: 1440, digits: 2 });
assert.deepEqual({ ...convert('100', '0.005', 'JPY', 'EUR') }, { minor: 50, digits: 2 });
assert.equal(convert('1.01', '1', 'JPY', 'EUR'), null);
assert.equal(convert('0', '1', 'EUR', 'EUR'), null);
assert.equal(convert('120', '0', 'CNY', 'EUR'), null);
assert.equal(convert('abc', '1', 'CNY', 'EUR'), null);
const html = fs.readFileSync('public/index.html', 'utf8');
assert.match(html, /id="fx-open-btn"/);
assert.match(html, /id="ae-fx-open-btn"/);
assert.doesNotMatch(html, /id="fx-nav-btn"/);
assert.match(html, /id="fx-fab-btn"/);
assert.match(html, /id="fx-fab-toggle"/);
assert.match(html, /<span data-i18n="nav_settings">Настройки<\/span>/);
assert.match(html, /\.ni span\{[^}]*white-space:nowrap/);
assert.match(html, /\.nav-items\{[^}]*overflow-x:auto/);
assert.equal((html.match(/class="ni(?: active)?"/g) || []).length, 5);
assert.match(html, /'pg-set':4/);
const listeners = new Map();
const domButtons = new Map(['fx-open-btn', 'ae-fx-open-btn', 'fx-fab-btn', 'fx-fab-toggle'].map(id => [id, { id, style: {}, setAttribute() {},
  addEventListener(type, listener) { listeners.set(id + ':' + type, listener); }
}]));
let onReady;
const dom = {
  documentElement: {},
  getElementById(id) { return domButtons.get(id); },
  addEventListener(type, listener) { if (type === 'DOMContentLoaded') onReady = listener; }
};
const bindingContext = {
  window: {}, document: dom, Intl, Number, BigInt,
  MutationObserver: class { observe() {} },
  getLang() { return 'ru'; }
};
vm.createContext(bindingContext);
vm.runInContext(fs.readFileSync('public/js/fx-calculator.js', 'utf8'), bindingContext);
onReady();
assert.equal(typeof listeners.get('fx-open-btn:click'), 'function');
assert.equal(typeof listeners.get('ae-fx-open-btn:click'), 'function');
assert.equal(typeof listeners.get('fx-fab-btn:click'), 'function');
assert.match(domButtons.get('ae-fx-open-btn').textContent, /калькулятор валют/i);
assert.equal(domButtons.get('fx-fab-btn').style.display, 'flex');
domButtons.get('fx-fab-toggle').checked = false;
listeners.get('fx-fab-toggle:change')();
assert.equal(domButtons.get('fx-fab-btn').style.display, 'none');
assert.equal((fs.readFileSync('public/js/i18n.js', 'utf8').match(/settings_fx_fab:/g) || []).length, 7);
console.log('PASS: FX conversion, five navigation items, optional calculator shortcut and seven languages');
